# MoEdge Engine v2

Portable plug-and-play crypto signal engine for apps.

**Default behavior is observer-only market intelligence.** It does not place trades, size positions, or execute orders.

## v2 upgrades

- Standalone OHLCV-only regime detector: `STRONG_UPTREND`, `UPTREND`, `RANGING`, `DOWNTREND`, `STRONG_DOWNTREND`
- Regime-conditional weights inside `EdgeConfig.regime_weights`
- R-multiple walk-forward backtest with `expected_R` / `EV`
- Score stability multiplier using rolling score standard deviation
- Trade DNA fingerprint metadata for future learning

## Install

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

For live exchange market data only:

```bash
pip install -e ".[live]"
```

## Quick start

```bash
moedge --demo
moedge --demo --backtest
moedge --symbol BTC/USDT --timeframe 1h --limit 200 --exchange binance
```

## Python usage

```python
from moedge import MoEdgeEngine, EdgeConfig

engine = MoEdgeEngine(EdgeConfig())
result = engine.score_from_ohlcv(ohlcv_rows, symbol="BTC/USDT")
print(result.to_dict())
```

OHLCV rows use CCXT format:

```python
[timestamp_ms, open, high, low, close, volume]
```

## Example output

```json
{
  "symbol": "BTC/USDT",
  "regime": "STRONG_UPTREND",
  "edge_score": 74.5,
  "signal": "WATCH_BUY",
  "risk": "medium",
  "expected_R": null,
  "stability_factor": 0.91,
  "trade_dna": {
    "regime": "STRONG_UPTREND",
    "volatility_class": "medium",
    "volume_state": "expanding",
    "momentum_direction": "positive"
  },
  "components": {},
  "reasons": []
}
```

## File map

- `moedge/engine.py` — scorer with regime-conditional weights
- `moedge/regime.py` — standalone regime classifier
- `moedge/backtest.py` — R-multiple EV backtest
- `moedge/stability.py` — score stability multiplier
- `moedge/trade_dna.py` — fingerprint builder
- `moedge/adapters/ccxt_adapter.py` — live market-data adapter, unchanged
- `moedge/cli.py` — JSON CLI
- `tests/` — portable tests, no internet required

## Hard rule

No executor. No order placement. No live trading logic. v3 only happens after paper-tested positive expectancy.

## Disclaimer

This is analytics software, not financial advice. Crypto markets are highly volatile.
