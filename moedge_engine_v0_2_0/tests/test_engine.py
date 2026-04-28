from moedge import MoEdgeEngine
from moedge.demo import generate_demo_ohlcv


def test_score_range_and_shape():
    data = generate_demo_ohlcv(200)
    result = MoEdgeEngine().score_from_ohlcv(data, symbol="DEMO/USDT")
    assert 0 <= result.edge_score <= 100
    assert result.symbol == "DEMO/USDT"
    assert result.signal in {"STRONG_WATCH_BUY", "WATCH_BUY", "NEUTRAL", "WAIT", "AVOID"}
    assert result.risk in {"low", "medium", "high"}
    assert "momentum" in result.components


def test_rejects_too_little_data():
    data = generate_demo_ohlcv(10)
    try:
        MoEdgeEngine().score_from_ohlcv(data)
    except ValueError as exc:
        assert "Need at least" in str(exc)
    else:
        raise AssertionError("Expected ValueError")


def test_orderbook_pressure_increases_score():
    data = generate_demo_ohlcv(200)
    engine = MoEdgeEngine()
    no_ob = engine.score_from_ohlcv(data)
    bullish_ob = {"bids": [[99, 1000]] * 10, "asks": [[101, 100]] * 10}
    with_ob = engine.score_from_ohlcv(data, orderbook=bullish_ob)
    assert with_ob.edge_score >= no_ob.edge_score
