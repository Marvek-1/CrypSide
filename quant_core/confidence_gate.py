"""
mo-crypside-confidence-gate-001
name: Confidence Gate
trigger: query on demand or scheduled
logic: measures paper performance toward live execution threshold
voiceLine: "200 truths before the warrior moves."
sass: "PF 1.30 is not a suggestion. It is the law."
qseal: 🜃∴🜂
"""

import math
import os

LIVE_DEMO_MODE = os.getenv("LIVE_DEMO_MODE", "false").lower() == "true"
GATE_MIN_SIGNALS = int(os.getenv("GATE_MIN_SIGNALS", "200"))
GATE_MIN_PF = float(os.getenv("GATE_MIN_PF", "1.30"))
GATE_CONFIDENCE = 0.95


def calculate_confidence_gate(conn) -> dict:
    """
    Reads resolved paper orders and evaluates gate conditions.
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE outcome IN ('WIN','LOSS','EXPIRED'))
                    AS total_resolved,
                COUNT(*) FILTER (WHERE outcome = 'WIN')  AS wins,
                COUNT(*) FILTER (WHERE outcome = 'LOSS') AS losses,
                COUNT(*) FILTER (WHERE outcome = 'EXPIRED') AS expired,
                COALESCE(SUM(r_multiple)
                    FILTER (WHERE outcome = 'WIN' AND r_multiple > 0), 0)
                    AS gross_profit_r,
                COALESCE(ABS(SUM(r_multiple)
                    FILTER (WHERE outcome = 'LOSS' AND r_multiple < 0)), 0)
                    AS gross_loss_r
            FROM paper_orders
            WHERE regime_version = 'v2_adx_ema_rsi'
              AND outcome IN ('WIN','LOSS','EXPIRED')
              AND confidence_gate_eligible = true
        """
        )
        row = cur.fetchone()

    (
        total,
        wins,
        losses,
        expired,
        gross_profit_r,
        gross_loss_r,
    ) = row

    total = total or 0
    wins = wins or 0
    losses = losses or 0
    expired = expired or 0
    gross_profit_r = float(gross_profit_r or 0)
    gross_loss_r = float(gross_loss_r or 0)

    win_rate = wins / total if total > 0 else 0.0
    profit_factor = gross_profit_r / gross_loss_r if gross_loss_r > 0 else 0.0

    # Wilson score confidence interval
    confidence = 0.0
    if total > 0:
        z = 1.96  # 95% confidence
        p = win_rate
        n = total
        confidence = (
            p + z * z / (2 * n) - z * math.sqrt((p * (1 - p) / n) + z * z / (4 * n * n))
        ) / (1 + z * z / n)

    signals_remaining = max(0, GATE_MIN_SIGNALS - total)
    pf_gap = max(0.0, round(GATE_MIN_PF - profit_factor, 4))

    real_gate_open = (
        total >= GATE_MIN_SIGNALS
        and profit_factor >= GATE_MIN_PF
        and confidence >= GATE_CONFIDENCE
    )

    metrics = {
        "signal_count": total,
        "win_rate": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "confidence": round(confidence, 4),
        "signals_remaining": signals_remaining,
        "pf_gap": pf_gap,
        "qseal": "🜃∴🜂",
    }

    if LIVE_DEMO_MODE:
        return {
            "gate_status": "OPEN",
            "mode": "LIVE_DEMO",
            "real_execution_allowed": False,
            "demo_execution_allowed": True,
            "verdict": "Gate OPEN (Live Demo Mode). Manual demo/testnet pilot may proceed.",
            "mo_lingua": "🜄GATE:OPEN|🜂LIVE:DEMO_MANUAL_AUTHORIZED|🜃VAULT:SIM_READY",
            "real_gate_open": real_gate_open,
            "requirements": {
                "min_signals": GATE_MIN_SIGNALS,
                "min_pf": GATE_MIN_PF,
                "current_signals": total,
                "current_pf": profit_factor,
            },
            **metrics
        }

    # Production Mode
    if real_gate_open:
        status = "OPEN"
        verdict = "Gate OPEN. Warrior may proceed."
        mo_lingua = "🜄GATE:OPEN|🜂LIVE:AUTHORIZED|🜃VAULT:READY"
    elif total >= GATE_MIN_SIGNALS * 0.5 and profit_factor >= 1.10:
        status = "PROVISIONAL"
        verdict = f"Provisional. {signals_remaining} signals remaining. PF={profit_factor:.4f} — needs {pf_gap:.4f} more."
        mo_lingua = "🜄GATE:PROVISIONAL|⛔LIVE:BLOCKED|🜃VAULT:WATCHING"
    else:
        status = "LOCKED"
        verdict = f"Gate LOCKED. Confidence requirements not met."
        mo_lingua = "🜄GATE:LOCKED|⛔LIVE:BLOCKED|🜃VAULT:WAIT"

    return {
        "gate_status": status,
        "mode": "PRODUCTION",
        "real_execution_allowed": real_gate_open,
        "demo_execution_allowed": False,
        "verdict": verdict,
        "mo_lingua": mo_lingua,
        "requirements": {
            "min_signals": GATE_MIN_SIGNALS,
            "min_pf": GATE_MIN_PF,
            "current_signals": total,
            "current_pf": profit_factor,
        },
        **metrics
    }
