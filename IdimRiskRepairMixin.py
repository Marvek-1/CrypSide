
# IdimRiskRepairMixin.py
# Drop this mixin into your Freqtrade strategy file, then inherit it before IStrategy:
# class YourStrategy(IdimRiskRepairMixin, IStrategy):
#
# Assumptions:
# - Your populate_indicators() already creates these columns when available:
#   market_regime or regime, signal_family or family, pwin, atr, close.
# - Your populate_entry_trend() sets enter_long / enter_short before this gate is applied.
# - Designed from uploaded review/trades data: 391 trades, WR≈38.1%, AvgR≈-0.39, current wins capped at +0.6R.

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd
from pandas import DataFrame

from freqtrade.persistence import Trade
from freqtrade.strategy import IStrategy, DecimalParameter
from freqtrade.strategy import stoploss_from_open


class IdimRiskRepairMixin:
    """
    Production gate for RR repair:
    1) Hard-block statistically bad cells/regimes/hours/families.
    2) Require pwin >= 0.65 only when pwin exists. Missing pwin blocks by default.
    3) Enforce TP >= 1.5R, default 2R, with static custom_roi.
    4) Keep hard stop at -1R equivalent; optional BE/trailing after profit.
    """

    # Freqtrade requires a hard floor stoploss. Use exchange/config sizing so this equals your 1R risk.
    stoploss = -0.035

    use_custom_stoploss = True
    use_custom_roi = True

    # Disable old ROI table so custom_roi controls exits.
    minimal_roi = {"0": 100}

    # Do not run Freqtrade trailing_stop together with custom_stoploss.
    trailing_stop = False

    # Hyperopt-safe, but do NOT hyperopt until the filter shows positive expectancy OOS.
    rr_take_profit = DecimalParameter(1.5, 2.5, default=2.0, decimals=2, space="sell", optimize=False)
    breakeven_after_r = DecimalParameter(1.0, 1.5, default=1.2, decimals=2, space="sell", optimize=False)

    # From uploaded trades: bad hours were materially negative; 21 was best but still not positive at 0.6R.
    # This is intentionally strict. Relax only after new post-repair sample proves it.
    ALLOWED_HOURS_UTC = {21, 11, 15, 2, 23, 9, 17, 10, 5, 18}

    # Uploaded review/trades show ranging and downtrend cells as bad/noisy.
    BLOCKED_REGIMES = {"RANGING", "DOWNTREND", "STRONG_DOWNTREND"}

    # Uploaded trades: NONE dominated and was unproven; bad/weak cells removed.
    # Keep only families that can be explicitly scored by your engine.
    ALLOWED_FAMILIES = {"trend", "momentum", "failed_bounce", "breakdown", "mean_reversion"}

    # Policy/cell blocks from uploaded file.
    # Format: (regime, side, family). Side must be LONG/SHORT.
    # These blocks are conservative because no cell with enough sample proved >62.5% WR.
    BLOCKED_CELLS = {
        ("RANGING", "LONG", "NONE"),
        ("RANGING", "SHORT", "NONE"),
        ("RANGING", "SHORT", "breakdown"),
        ("DOWNTREND", "LONG", "NONE"),
        ("STRONG_DOWNTREND", "SHORT", "breakdown"),
        ("UPTREND", "LONG", "NONE"),
        ("STRONG_UPTREND", "LONG", "NONE"),
        ("UPTREND", "SHORT", "failed_bounce"),
        ("UPTREND", "LONG", "trend"),
        ("STRONG_UPTREND", "LONG", "momentum"),
        ("STRONG_UPTREND", "LONG", "mean_reversion"),
    }

    REQUIRE_PWIN = True
    MIN_PWIN = 0.65

    def _col(self, row: pd.Series, *names: str, default: Any = None) -> Any:
        for name in names:
            if name in row and pd.notna(row[name]):
                return row[name]
        return default

    def _risk_pct_from_trade(self, trade: Trade) -> float:
        """
        Returns the configured 1R loss as a positive profit ratio.
        Example: stoploss=-0.035 => 1R = 0.035.
        """
        lev = float(getattr(trade, "leverage", 1.0) or 1.0)
        return abs(float(self.stoploss)) / max(lev, 1e-9)

    def apply_idim_entry_gate(self, dataframe: DataFrame) -> DataFrame:
        """
        Call this at the END of populate_entry_trend(), after enter_long/enter_short are set.
        It clears entries that fail the real-money math gate.
        """

        df = dataframe.copy()

        if "enter_long" not in df:
            df["enter_long"] = 0
        if "enter_short" not in df:
            df["enter_short"] = 0

        regime_col = "market_regime" if "market_regime" in df.columns else "regime" if "regime" in df.columns else None
        family_col = "signal_family" if "signal_family" in df.columns else "family" if "family" in df.columns else None

        df["idim_hour_utc"] = df.index.hour if isinstance(df.index, pd.DatetimeIndex) else pd.to_datetime(df["date"], utc=True).dt.hour

        allow = pd.Series(True, index=df.index)

        allow &= df["idim_hour_utc"].isin(self.ALLOWED_HOURS_UTC)

        if regime_col:
            allow &= ~df[regime_col].astype(str).isin(self.BLOCKED_REGIMES)
        else:
            allow &= False

        if family_col:
            allow &= df[family_col].astype(str).isin(self.ALLOWED_FAMILIES)
        else:
            allow &= False

        if self.REQUIRE_PWIN:
            if "pwin" in df.columns:
                allow &= pd.to_numeric(df["pwin"], errors="coerce").fillna(-1) >= self.MIN_PWIN
            else:
                allow &= False

        # Cell-level block. Use side-specific masks.
        if regime_col and family_col:
            reg = df[regime_col].astype(str)
            fam = df[family_col].astype(str)

            long_block = pd.Series(False, index=df.index)
            short_block = pd.Series(False, index=df.index)

            for blocked_regime, blocked_side, blocked_family in self.BLOCKED_CELLS:
                m = (reg == blocked_regime) & (fam == blocked_family)
                if blocked_side == "LONG":
                    long_block |= m
                elif blocked_side == "SHORT":
                    short_block |= m

            df.loc[long_block, "enter_long"] = 0
            df.loc[short_block, "enter_short"] = 0

        df.loc[~allow, ["enter_long", "enter_short"]] = 0
        return df

    def custom_roi(
        self,
        pair: str,
        trade: Trade,
        current_time: datetime,
        trade_duration: int,
        entry_tag: str | None,
        side: str,
        **kwargs,
    ) -> float | None:
        """
        Static 2R take-profit by default.
        If stoploss is -3.5%, TP target is +7.0% at 1x.
        """
        risk_pct = self._risk_pct_from_trade(trade)
        return float(self.rr_take_profit.value) * risk_pct

    def custom_stoploss(
        self,
        pair: str,
        trade: Trade,
        current_time: datetime,
        current_rate: float,
        current_profit: float,
        after_fill: bool,
        **kwargs,
    ) -> float | None:
        """
        Keep initial hard stop until trade earns enough R, then protect capital.
        Uses Freqtrade helper so stop is relative to open price, not current price.
        """
        risk_pct = self._risk_pct_from_trade(trade)
        be_trigger = float(self.breakeven_after_r.value) * risk_pct

        if current_profit >= be_trigger:
            # Lock tiny profit after fees/slippage buffer. Adjust if your fee model differs.
            return stoploss_from_open(
                0.001,
                current_profit,
                is_short=trade.is_short,
                leverage=trade.leverage,
            )

        return None
