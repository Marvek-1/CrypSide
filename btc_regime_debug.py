import sys

sys.path.insert(0, "observer_bundle")
import ccxt
import config
import pandas as pd
import ta

exchange = ccxt.binance({"enableRateLimit": True})
ohlcv = exchange.fetch_ohlcv("BTC/USDT", "15m", limit=200)

closes = [x[4] for x in ohlcv]
highs = [x[2] for x in ohlcv]
lows = [x[3] for x in ohlcv]
vols = [x[5] for x in ohlcv]

df = pd.DataFrame({"close": closes, "high": highs, "low": lows, "volume": vols})

ema20 = df["close"].ewm(span=20).mean().iloc[-1]
ema50 = df["close"].ewm(span=50).mean().iloc[-1]
price = df["close"].iloc[-1]
spread = (ema20 - ema50) / ema50 * 100
adx_val = ta.trend.adx(df["high"], df["low"], df["close"], 14).iloc[-1]
rsi_val = ta.momentum.rsi(df["close"], 14).iloc[-1]
ret_20 = (price - df["close"].iloc[-21]) / df["close"].iloc[-21] * 100

print(f"BTC price:     {price:.2f}")
print(f"EMA20:         {ema20:.2f}")
print(f"EMA50:         {ema50:.2f}")
print(f"EMA spread:    {spread:.4f}%")
print(f"ADX:           {adx_val:.2f}")
print(f"RSI:           {rsi_val:.2f}")
print(f"20-bar return: {ret_20:.4f}%")
print(f"BTC_REGIME_MODE:              {getattr(config, 'BTC_REGIME_MODE', 'NOT SET')}")
print(
    f"BTC_REGIME_ADX_STRONG:        {getattr(config, 'BTC_REGIME_ADX_STRONG', 'NOT SET')}"
)
print(
    f"BTC_REGIME_ADX_TREND:         {getattr(config, 'BTC_REGIME_ADX_TREND', 'NOT SET')}"
)
print(
    f"BTC_REGIME_EMA_SPREAD_STRONG: {getattr(config, 'BTC_REGIME_EMA_SPREAD_STRONG', 'NOT SET')}"
)
print(
    f"BTC_REGIME_EMA_SPREAD_TREND:  {getattr(config, 'BTC_REGIME_EMA_SPREAD_TREND', 'NOT SET')}"
)
print(
    f"BTC_REGIME_RETURN_STRONG:     {getattr(config, 'BTC_REGIME_RETURN_STRONG', 'NOT SET')}"
)
print(
    f"BTC_REGIME_RETURN_TREND:      {getattr(config, 'BTC_REGIME_RETURN_TREND', 'NOT SET')}"
)
print(
    f"BTC_REGIME_FALLBACK:          {getattr(config, 'BTC_REGIME_FALLBACK', 'NOT SET')}"
)
