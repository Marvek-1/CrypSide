from __future__ import annotations

from typing import Any, Optional


class CCXTMarketData:
    """Small adapter around CCXT.

    Public market data works without API keys on most exchanges.
    """

    def __init__(self, exchange_id: str = "binance", *, api_key: Optional[str] = None, secret: Optional[str] = None):
        try:
            import ccxt  # type: ignore
        except ImportError as exc:
            raise RuntimeError("ccxt is not installed. Run: pip install ccxt") from exc

        if not hasattr(ccxt, exchange_id):
            raise ValueError(f"Unsupported exchange id for installed CCXT: {exchange_id}")

        exchange_class = getattr(ccxt, exchange_id)
        params: dict[str, Any] = {"enableRateLimit": True}
        if api_key and secret:
            params.update({"apiKey": api_key, "secret": secret})

        self.exchange = exchange_class(params)

    def fetch_ohlcv(self, symbol: str, timeframe: str = "1h", limit: int = 200):
        return self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    def fetch_order_book(self, symbol: str, limit: int = 20):
        return self.exchange.fetch_order_book(symbol, limit=limit)
