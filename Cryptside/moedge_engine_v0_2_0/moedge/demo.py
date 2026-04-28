from __future__ import annotations

import random
import time


def generate_demo_ohlcv(rows: int = 200, seed: int = 7):
    random.seed(seed)
    now = int(time.time() // 3600 * 3600 * 1000)
    price = 100.0
    out = []

    for i in range(rows):
        drift = 0.0015 if i > rows * 0.55 else 0.0001
        shock = random.gauss(drift, 0.012)
        open_ = price
        close = max(1.0, price * (1 + shock))
        high = max(open_, close) * (1 + abs(random.gauss(0, 0.004)))
        low = min(open_, close) * (1 - abs(random.gauss(0, 0.004)))
        volume = 1000 + random.random() * 500
        if i > rows * 0.75:
            volume *= 2.2
        out.append([now - (rows - i) * 3600_000, open_, high, low, close, volume])
        price = close

    return out
