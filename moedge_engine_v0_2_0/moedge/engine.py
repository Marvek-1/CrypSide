from __future__ import annotations

from dataclasses import dataclass, asdict, field
from typing import Any, Optional, Sequence
import math

import pandas as pd

from .regime import classify_regime
from .stability import stability_factor as compute_stability_factor
from .trade_dna import build_trade_dna


OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


@dataclass(frozen=True)
class EdgeConfig:
    momentum_window: int = 12
    volume_window: int = 24
    volatility_window: int = 24
    trend_fast_window: int = 12
    trend_slow_window: int = 48

    # Legacy default weights remain for backwards-compatible config loading.
    momentum_weight: float = 30.0
    volume_weight: float = 20.0
    volatility_weight: float = 20.0
    trend_weight: float = 15.0
    orderbook_weight: float = 15.0

    regime_weights: dict[str, dict[str, float]] = field(default_factory=lambda: {
        "STRONG_UPTREND": {"momentum": 40.0, "volume": 25.0, "volatility": 10.0, "trend": 15.0, "orderbook": 10.0},
        "UPTREND": {"momentum": 35.0, "volume": 22.0, "volatility": 13.0, "trend": 18.0, "orderbook": 12.0},
        "RANGING": {"momentum": 10.0, "volume": 15.0, "volatility": 30.0, "trend": 10.0, "orderbook": 35.0},
        "DOWNTREND": {"momentum": 15.0, "volume": 20.0, "volatility": 25.0, "trend": 15.0, "orderbook": 25.0},
        "STRONG_DOWNTREND": {"momentum": 10.0, "volume": 20.0, "volatility": 30.0, "trend": 10.0, "orderbook": 30.0},
        "DEFAULT": {"momentum": 30.0, "volume": 20.0, "volatility": 20.0, "trend": 15.0, "orderbook": 15.0},
    })

    high_risk_volatility: float = 0.055
    medium_risk_volatility: float = 0.030

    watch_buy_threshold: float = 65.0
    strong_buy_threshold: float = 80.0
    neutral_threshold: float = 45.0

    stability_window: int = 5
    stability_min_factor: float = 0.70

    min_rows: int = 60


@dataclass(frozen=True)
class EdgeResult:
    symbol: str
    regime: str
    edge_score: float
    signal: str
    risk: str
    reasons: list[str]
    components: dict[str, float]
    stability_factor: float
    trade_dna: dict[str, str]
    expected_R: Optional[float] = None
    latest_close: Optional[float] = None
    timestamp: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class MoEdgeEngine:
    """Deterministic crypto signal and risk scorer.

    This class never places orders. It only analyzes market data.
    """

    def __init__(self, config: Optional[EdgeConfig] = None):
        self.config = config or EdgeConfig()

    def get_weights(self, regime: str) -> dict[str, float]:
        default = {
            "momentum": self.config.momentum_weight,
            "volume": self.config.volume_weight,
            "volatility": self.config.volatility_weight,
            "trend": self.config.trend_weight,
            "orderbook": self.config.orderbook_weight,
        }
        configured_default = self.config.regime_weights.get("DEFAULT", default)
        weights = self.config.regime_weights.get(regime, configured_default)
        return {**configured_default, **weights}

    def score_from_ohlcv(
        self,
        ohlcv: Sequence[Sequence[float]],
        *,
        symbol: str = "UNKNOWN",
        orderbook: Optional[dict[str, Any]] = None,
        expected_R: Optional[float] = None,
    ) -> EdgeResult:
        df = self._to_dataframe(ohlcv)
        self._validate_df(df)

        regime = classify_regime(ohlcv)
        raw_scores: list[float] = []
        last_payload: dict[str, Any] | None = None

        start = max(self.config.min_rows, len(df) - self.config.stability_window + 1)
        for end in range(start, len(df) + 1):
            slice_df = df.iloc[:end].reset_index(drop=True)
            slice_regime = classify_regime(slice_df[OHLCV_COLUMNS].values.tolist())
            payload = self._score_dataframe(slice_df, slice_regime, orderbook if end == len(df) else None)
            raw_scores.append(payload["raw_score"])
            if end == len(df):
                last_payload = payload

        assert last_payload is not None
        factor = compute_stability_factor(
            raw_scores,
            window=self.config.stability_window,
            min_factor=self.config.stability_min_factor,
        )
        score = round(float(max(0.0, min(100.0, last_payload["raw_score"] * factor))), 2)

        volatility = last_payload["volatility"]
        momentum_raw = last_payload["momentum_raw"]
        volume_surge = last_payload["volume_surge"]
        trend_raw = last_payload["trend_raw"]
        orderbook_component = last_payload["components"]["orderbook_pressure"]

        risk = self._risk(volatility, score)
        signal = self._signal(score, risk)
        reasons = self._reasons(momentum_raw, volume_surge, volatility, trend_raw, orderbook_component)
        reasons.insert(0, f"regime={regime}")
        if factor < 0.95:
            reasons.append("score stability penalty applied")

        return EdgeResult(
            symbol=symbol,
            regime=regime,
            edge_score=score,
            signal=signal,
            risk=risk,
            reasons=reasons,
            components=last_payload["components"],
            stability_factor=factor,
            trade_dna=build_trade_dna(
                regime=regime,
                volatility=volatility,
                volume_surge=volume_surge,
                momentum=momentum_raw,
            ),
            expected_R=expected_R,
            latest_close=round(float(df["close"].iloc[-1]), 8),
            timestamp=int(df["timestamp"].iloc[-1]),
        )

    def _score_dataframe(self, df: pd.DataFrame, regime: str, orderbook: Optional[dict[str, Any]]) -> dict[str, Any]:
        c = self.config
        weights = self.get_weights(regime)
        close = df["close"]
        volume = df["volume"]
        returns = close.pct_change()

        momentum_raw = (close.iloc[-1] / close.iloc[-1 - c.momentum_window]) - 1
        momentum_component = self._scale_positive(momentum_raw, good_at=0.06, weight=weights["momentum"])

        volume_mean = volume.rolling(c.volume_window).mean().iloc[-1]
        volume_surge = float(volume.iloc[-1] / volume_mean) if volume_mean and not math.isnan(volume_mean) else 1.0
        volume_component = self._scale_positive(volume_surge - 1.0, good_at=2.0, weight=weights["volume"])

        volatility = float(returns.rolling(c.volatility_window).std().iloc[-1] or 0.0)
        volatility_component = self._scale_inverse(volatility, bad_at=c.high_risk_volatility, weight=weights["volatility"])

        fast = close.rolling(c.trend_fast_window).mean().iloc[-1]
        slow = close.rolling(c.trend_slow_window).mean().iloc[-1]
        trend_raw = ((fast / slow) - 1.0) if slow and not math.isnan(slow) else 0.0
        trend_component = self._scale_positive(trend_raw, good_at=0.04, weight=weights["trend"])

        orderbook_component = self._orderbook_component(orderbook, weight=weights["orderbook"])

        raw_score = float(momentum_component + volume_component + volatility_component + trend_component + orderbook_component)

        return {
            "raw_score": max(0.0, min(100.0, raw_score)),
            "momentum_raw": float(momentum_raw),
            "volume_surge": float(volume_surge),
            "volatility": float(volatility),
            "trend_raw": float(trend_raw),
            "components": {
                "momentum": round(momentum_component, 2),
                "volume_surge": round(volume_component, 2),
                "volatility_safety": round(volatility_component, 2),
                "trend_strength": round(trend_component, 2),
                "orderbook_pressure": round(orderbook_component, 2),
                "raw_momentum": round(float(momentum_raw), 6),
                "raw_volume_surge": round(float(volume_surge), 6),
                "raw_volatility": round(float(volatility), 6),
                "raw_trend": round(float(trend_raw), 6),
                "weights_momentum": round(float(weights["momentum"]), 2),
                "weights_volume": round(float(weights["volume"]), 2),
                "weights_volatility": round(float(weights["volatility"]), 2),
                "weights_trend": round(float(weights["trend"]), 2),
                "weights_orderbook": round(float(weights["orderbook"]), 2),
            },
        }

    def _to_dataframe(self, ohlcv: Sequence[Sequence[float]]) -> pd.DataFrame:
        df = pd.DataFrame(list(ohlcv), columns=OHLCV_COLUMNS)
        for col in OHLCV_COLUMNS:
            df[col] = pd.to_numeric(df[col], errors="coerce")
        return df.dropna().reset_index(drop=True)

    def _validate_df(self, df: pd.DataFrame) -> None:
        if len(df) < self.config.min_rows:
            raise ValueError(f"Need at least {self.config.min_rows} OHLCV rows; got {len(df)}.")
        if (df["close"] <= 0).any():
            raise ValueError("OHLCV close prices must be positive.")
        if (df["volume"] < 0).any():
            raise ValueError("OHLCV volumes cannot be negative.")

    def _scale_positive(self, value: float, *, good_at: float, weight: float) -> float:
        if value <= 0:
            return 0.0
        return min(value / good_at, 1.0) * weight

    def _scale_inverse(self, value: float, *, bad_at: float, weight: float) -> float:
        if value <= 0:
            return weight
        return max(0.0, 1.0 - min(value / bad_at, 1.0)) * weight

    def _orderbook_component(self, orderbook: Optional[dict[str, Any]], *, weight: Optional[float] = None) -> float:
        if not orderbook:
            return 0.0

        bids = orderbook.get("bids") or []
        asks = orderbook.get("asks") or []
        if not bids or not asks:
            return 0.0

        bid_depth = sum(float(row[1]) for row in bids[:10] if len(row) >= 2)
        ask_depth = sum(float(row[1]) for row in asks[:10] if len(row) >= 2)
        total = bid_depth + ask_depth
        if total <= 0:
            return 0.0

        imbalance = (bid_depth - ask_depth) / total
        return self._scale_positive(imbalance, good_at=0.35, weight=weight if weight is not None else self.config.orderbook_weight)

    def _risk(self, volatility: float, score: float) -> str:
        c = self.config
        if volatility >= c.high_risk_volatility:
            return "high"
        if volatility >= c.medium_risk_volatility:
            return "medium"
        if score >= c.strong_buy_threshold:
            return "medium"
        return "low"

    def _signal(self, score: float, risk: str) -> str:
        c = self.config
        if risk == "high" and score < c.strong_buy_threshold:
            return "AVOID"
        if score >= c.strong_buy_threshold and risk != "high":
            return "STRONG_WATCH_BUY"
        if score >= c.watch_buy_threshold and risk != "high":
            return "WATCH_BUY"
        if score >= c.neutral_threshold:
            return "NEUTRAL"
        return "WAIT"

    def _reasons(self, momentum: float, volume_surge: float, volatility: float, trend: float, ob_component: float) -> list[str]:
        reasons: list[str] = []

        if momentum > 0.03:
            reasons.append("positive momentum")
        elif momentum < -0.03:
            reasons.append("negative momentum")

        if volume_surge >= 1.8:
            reasons.append("volume surge detected")
        elif volume_surge < 0.7:
            reasons.append("weak volume")

        if volatility >= self.config.high_risk_volatility:
            reasons.append("high volatility risk")
        elif volatility <= self.config.medium_risk_volatility:
            reasons.append("controlled volatility")

        if trend > 0.02:
            reasons.append("fast trend above slow trend")
        elif trend < -0.02:
            reasons.append("trend weakness")

        if ob_component > 7.5:
            reasons.append("bid-side order book pressure")

        if not reasons:
            reasons.append("mixed market structure")

        return reasons
