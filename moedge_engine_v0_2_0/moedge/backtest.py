from __future__ import annotations

from typing import Sequence

import pandas as pd

from .engine import MoEdgeEngine, EdgeConfig, OHLCV_COLUMNS


def _to_dataframe(ohlcv: Sequence[Sequence[float]]) -> pd.DataFrame:
    df = pd.DataFrame(list(ohlcv), columns=OHLCV_COLUMNS)
    for col in OHLCV_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna().reset_index(drop=True)


def atr_from_window(ohlcv: Sequence[Sequence[float]], period: int = 14) -> float:
    df = _to_dataframe(ohlcv)
    high = df["high"]
    low = df["low"]
    close = df["close"]
    tr = pd.concat(
        [
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs(),
        ],
        axis=1,
    ).max(axis=1)
    value = tr.rolling(period).mean().iloc[-1]
    if pd.isna(value) or value <= 0:
        return float((high - low).tail(period).mean() or 0.0)
    return float(value)


def compute_r_multiple(
    entry: float,
    candles_forward: Sequence[Sequence[float]],
    *,
    tp_r: float = 2.0,
    sl_r: float = 1.0,
    atr: float,
    direction: str = "long",
) -> float:
    """Compute first-touch R outcome using ATR as 1R distance.

    OHLCV index convention: high=candle[2], low=candle[3].
    Returns tp_r, -sl_r, or 0.0 for expiry.
    """
    if atr <= 0:
        raise ValueError("atr must be positive")
    if direction not in {"long", "short"}:
        raise ValueError("direction must be 'long' or 'short'")

    if direction == "long":
        tp_price = entry + (tp_r * atr)
        sl_price = entry - (sl_r * atr)
        for candle in candles_forward:
            high = float(candle[2])
            low = float(candle[3])
            if high >= tp_price:
                return float(tp_r)
            if low <= sl_price:
                return -float(sl_r)
    else:
        tp_price = entry - (tp_r * atr)
        sl_price = entry + (sl_r * atr)
        for candle in candles_forward:
            high = float(candle[2])
            low = float(candle[3])
            if low <= tp_price:
                return float(tp_r)
            if high >= sl_price:
                return -float(sl_r)

    return 0.0


def walk_forward_backtest(
    ohlcv: Sequence[Sequence[float]],
    *,
    symbol: str = "UNKNOWN",
    config: EdgeConfig | None = None,
    horizon: int = 6,
    threshold: float = 65.0,
    tp_r: float = 2.0,
    sl_r: float = 1.0,
    atr_period: int = 14,
) -> dict:
    """Walk-forward R-multiple test.

    Scores on a rolling historical window only, then measures forward outcome via
    TP/SL first touch. Reports EV rather than relying on directional hit rate.
    """
    cfg = config or EdgeConfig()
    engine = MoEdgeEngine(cfg)
    min_rows = cfg.min_rows
    signals = 0
    wins = 0
    losses = 0
    expired = 0
    r_values: list[float] = []
    scored = []

    for end in range(min_rows, len(ohlcv) - horizon):
        window = ohlcv[:end]
        result = engine.score_from_ohlcv(window, symbol=symbol)
        if result.edge_score >= threshold and result.signal not in {"AVOID", "WAIT"}:
            signals += 1
            entry = float(ohlcv[end - 1][4])
            atr = atr_from_window(window, atr_period)
            forward = ohlcv[end:end + horizon]
            r_multiple = compute_r_multiple(entry, forward, tp_r=tp_r, sl_r=sl_r, atr=atr, direction="long")
            r_values.append(r_multiple)
            if r_multiple > 0:
                wins += 1
            elif r_multiple < 0:
                losses += 1
            else:
                expired += 1

            scored.append({
                "timestamp": int(ohlcv[end - 1][0]),
                "score": result.edge_score,
                "regime": result.regime,
                "entry": entry,
                "atr": round(atr, 8),
                "r_multiple": round(r_multiple, 4),
                "outcome": "WIN" if r_multiple > 0 else "LOSS" if r_multiple < 0 else "EXPIRED",
            })

    win_rate = wins / signals if signals else 0.0
    loss_rate = losses / signals if signals else 0.0
    avg_win_R = sum(r for r in r_values if r > 0) / wins if wins else 0.0
    avg_loss_R = abs(sum(r for r in r_values if r < 0) / losses) if losses else 0.0
    expected_R = (win_rate * avg_win_R) - (loss_rate * avg_loss_R)

    return {
        "symbol": symbol,
        "signals": signals,
        "wins": wins,
        "losses": losses,
        "expired": expired,
        "hit_rate": round(win_rate, 4),  # kept for backwards-compatible callers/tests
        "win_rate": round(win_rate, 4),
        "loss_rate": round(loss_rate, 4),
        "avg_win_R": round(avg_win_R, 4),
        "avg_loss_R": round(avg_loss_R, 4),
        "expected_R": round(expected_R, 4),
        "EV": round(expected_R, 4),
        "horizon": horizon,
        "threshold": threshold,
        "tp_r": tp_r,
        "sl_r": sl_r,
        "sample": scored[-10:],
    }
