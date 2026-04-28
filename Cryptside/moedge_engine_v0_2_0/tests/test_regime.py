from moedge.demo import generate_demo_ohlcv
from moedge.regime import classify_regime


def test_regime_returns_allowed_value():
    data = generate_demo_ohlcv(200)
    assert classify_regime(data) in {
        "STRONG_UPTREND",
        "UPTREND",
        "RANGING",
        "DOWNTREND",
        "STRONG_DOWNTREND",
    }


def test_short_history_defaults_to_ranging():
    data = generate_demo_ohlcv(20)
    assert classify_regime(data) == "RANGING"
