from __future__ import annotations

import argparse
import json
import os
import sys

from .config import load_config
from .demo import generate_demo_ohlcv
from .engine import MoEdgeEngine
from .backtest import walk_forward_backtest


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="MoEdge Engine crypto signal/risk scorer")
    parser.add_argument("--exchange", default="binance", help="CCXT exchange id")
    parser.add_argument("--symbol", default="BTC/USDT", help="Market symbol")
    parser.add_argument("--timeframe", default="1h", help="OHLCV timeframe")
    parser.add_argument("--limit", type=int, default=200, help="Number of candles")
    parser.add_argument("--config", default=None, help="YAML config path")
    parser.add_argument("--demo", action="store_true", help="Use generated demo data")
    parser.add_argument("--with-orderbook", action="store_true", help="Include order book pressure")
    parser.add_argument("--backtest", action="store_true", help="Run simple walk-forward backtest")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    config = load_config(args.config)

    if args.demo:
        ohlcv = generate_demo_ohlcv(rows=max(args.limit, config.min_rows + 20))
        orderbook = None
    else:
        from .adapters.ccxt_adapter import CCXTMarketData

        md = CCXTMarketData(
            args.exchange,
            api_key=os.getenv(f"{args.exchange.upper()}_API_KEY"),
            secret=os.getenv(f"{args.exchange.upper()}_SECRET"),
        )
        ohlcv = md.fetch_ohlcv(args.symbol, timeframe=args.timeframe, limit=args.limit)
        orderbook = md.fetch_order_book(args.symbol) if args.with_orderbook else None

    if args.backtest:
        result = walk_forward_backtest(ohlcv, symbol=args.symbol, config=config)
    else:
        result = MoEdgeEngine(config).score_from_ohlcv(ohlcv, symbol=args.symbol, orderbook=orderbook).to_dict()

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
