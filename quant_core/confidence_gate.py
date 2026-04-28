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
from dataclasses import dataclass

GATE_MIN_SIGNALS = 200
GATE_MIN_PF = 1.30
GATE_CONFIDENCE = 0.95


@dataclass
class GateStatus:
    status: str  # LOCKED / PROVISIONAL / OPEN
    signal_count: int
    win_count: int
    loss_count: int
    expired_count: int
    win_rate: float
    profit_factor: float
    confidence: float
    signals_remaining: int
    pf_gap: float
    verdict: str
    mo_lingua: str
    qseal: str = "🜃∴🜂"


def calculate_confidence_gate(conn) -> GateStatus:
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

    # Determine gate status
    if (
        total >= GATE_MIN_SIGNALS
        and profit_factor >= GATE_MIN_PF
        and confidence >= GATE_CONFIDENCE
    ):
        status = "OPEN"
        verdict = (
            f"Gate OPEN. {total} signals. "
            f"PF={profit_factor:.4f}. "
            f"Confidence={confidence:.2%}. "
            f"Warrior may proceed to manual live pilot."
        )
        mo_lingua = "🜄GATE:OPEN|🜂LIVE:MANUAL_AUTHORIZED|🜃VAULT:READY"
    elif total >= GATE_MIN_SIGNALS * 0.5 and profit_factor >= 1.10:
        status = "PROVISIONAL"
        verdict = (
            f"Provisional. {signals_remaining} signals remaining. "
            f"PF={profit_factor:.4f} — needs {pf_gap:.4f} more. "
            f"Keep collecting."
        )
        mo_lingua = "🜄GATE:PROVISIONAL|⛔LIVE:BLOCKED|🜃VAULT:WATCHING"
    else:
        status = "LOCKED"
        verdict = (
            f"Gate LOCKED. {signals_remaining} signals remaining. "
            f"PF={profit_factor:.4f}. "
            f"Oracle still collecting truth."
        )
        mo_lingua = "🜄GATE:LOCKED|⛔LIVE:BLOCKED|🜃VAULT:PATIENT"

    return GateStatus(
        status=status,
        signal_count=total,
        win_count=wins,
        loss_count=losses,
        expired_count=expired,
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 4),
        confidence=round(confidence, 4),
        signals_remaining=signals_remaining,
        pf_gap=pf_gap,
        verdict=verdict,
        mo_lingua=mo_lingua,
    )
