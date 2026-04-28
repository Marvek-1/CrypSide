from moedge.backtest import walk_forward_backtest
from moedge.demo import generate_demo_ohlcv


def test_backtest_returns_metrics():
    data = generate_demo_ohlcv(180)
    result = walk_forward_backtest(data, symbol="DEMO/USDT", horizon=3)
    assert result["symbol"] == "DEMO/USDT"
    assert "hit_rate" in result
    assert 0 <= result["hit_rate"] <= 1


from moedge.backtest import compute_r_multiple


def test_compute_r_multiple_tp_first():
    entry = 100.0
    forward = [
        [1, 100, 101, 99.5, 100.5, 10],
        [2, 100.5, 102.1, 100.2, 102.0, 10],
    ]
    assert compute_r_multiple(entry, forward, tp_r=2.0, sl_r=1.0, atr=1.0) == 2.0


def test_compute_r_multiple_sl_first():
    entry = 100.0
    forward = [[1, 100, 100.5, 98.9, 99.2, 10]]
    assert compute_r_multiple(entry, forward, tp_r=2.0, sl_r=1.0, atr=1.0) == -1.0
