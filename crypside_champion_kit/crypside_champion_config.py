"""
CrypSide Champion Profile Configuration
Auto-generated from Fabricate stress test on 2026-04-27
Stress-test verdict: CHAMPION_CONFIRMED (5/5 seeds)
"""

# --- Signal gates ---
MIN_SIGNAL_SCORE = 50              # prob_floor_long
PROB_FLOOR_SHORT = 60              # was 58 — tighter bar for shorts
MOEDGE_TRASH_FILTER = 15           # drop weak MoEdge scores

# --- Behaviour knobs ---
EXHAUSTION_STRICTNESS = "medium"   # was "high"
BTC_REGIME_MODE = "adaptive"       # was "strict" — THE UNLOCK

# --- Safety guardrails (abort + rollback if breached) ---
WR_BAND = (55.0, 62.0)
MIN_PROFIT_FACTOR = 1.25
MIN_EXPECTED_R = 0.15
MAX_TOP_KILLER_PCT = 45.0
MIN_SIGNALS_PER_DAY = 6.0
MAX_DRAWDOWN_R_ABORT = 25.0        # 2x stress-test worst (13.8R)

# --- Drift bands (90% CI from 5-seed stress test) ---
DRIFT_BANDS = {
    "win_rate":        {"mean": 60.24,       "low": 59.50, "high": 60.98},
    "profit_factor":   {"mean": 2.082,  "low": 2.028, "high": 2.136},
    "expected_r":      {"mean": 0.393,     "low": 0.381, "high": 0.405},
    "signals_per_day": {"mean": 6.5,"low": 5.86, "high": 7.14},
}

# --- Rollback recipe (if things go sideways) ---
ROLLBACK_PROFILE = {
    "MIN_SIGNAL_SCORE": 52,
    "PROB_FLOOR_SHORT": 58,
    "MOEDGE_TRASH_FILTER": 12,
    "EXHAUSTION_STRICTNESS": "high",
    "BTC_REGIME_MODE": "strict",
}
