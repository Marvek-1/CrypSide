from __future__ import annotations

from typing import Sequence

import pandas as pd

OHLCV_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]

REGIMES = {"STRONG_UPTREND", "UPTREND", "RANGING", "DOWNTREND", "STRONG_DOWNTREND"}


def to_dataframe(ohlcv: Sequence[Sequence[float]]) -> pd.DataFrame:
    df = pd.DataFrame(list(ohlcv), columns=OHLCV_COLUMNS)
    for col in OHLCV_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df.dropna().reset_index(drop=True)


def ema(series: pd.Series, span: int) -> pd.Series:
    return series.ewm(span=span, adjust=False).mean()


def rsi(close: pd.Series, period: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, pd.NA)
    return (100 - (100 / (1 + rs))).fillna(50.0)


def adx(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close = df["close"]

    up_move = high.diff()
    down_move = -low.diff()

    plus_dm = up_move.where((up_move > down_move) & (up_move > 0), 0.0)
    minus_dm = down_move.where((down_move > up_move) & (down_move > 0), 0.0)

    tr = pd.concat(
        [
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs(),
        ],
        axis=1,
    ).max(axis=1)

    atr = tr.rolling(period).mean()
    plus_di = 100 * plus_dm.rolling(period).mean() / atr.replace(0, pd.NA)
    minus_di = 100 * minus_dm.rolling(period).mean() / atr.replace(0, pd.NA)
    dx = ((plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, pd.NA)) * 100
    return dx.rolling(period).mean().fillna(0.0)


def classify_regime(ohlcv: Sequence[Sequence[float]]) -> str:
    """Classify market regime from OHLCV only.

    Reference logic mirrors CrypSide-style ADX + EMA crossover + RSI:
    STRONG_UPTREND:   ADX > 30 and EMA20 > EMA50 and price > EMA20 and RSI > 55
    STRONG_DOWNTREND: ADX > 30 and EMA20 < EMA50 and price < EMA20 and RSI < 45
    UPTREND:          ADX > 20 and EMA20 > EMA50
    DOWNTREND:        ADX > 20 and EMA20 < EMA50
    Default:          RANGING
    """
    df = to_dataframe(ohlcv)
    if len(df) < 60:
        return "RANGING"

    close = df["close"]
    price = float(close.iloc[-1])
    ema20 = float(ema(close, 20).iloc[-1])
    ema50 = float(ema(close, 50).iloc[-1])
    rsi14 = float(rsi(close, 14).iloc[-1])
    adx14 = float(adx(df, 14).iloc[-1])

    if adx14 > 30 and ema20 > ema50 and price > ema20 and rsi14 > 55:
        return "STRONG_UPTREND"
    if adx14 > 30 and ema20 < ema50 and price < ema20 and rsi14 < 45:
        return "STRONG_DOWNTREND"
    if adx14 > 20 and ema20 > ema50:
        return "UPTREND"
    if adx14 > 20 and ema20 < ema50:
        return "DOWNTREND"
    return "RANGING"
