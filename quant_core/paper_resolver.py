"""
mo-crypside-paper-resolver-001
name: Paper Order Outcome Resolver
trigger: scheduled every 300s or on price tick
logic: checks open paper orders against current price
       resolves to WIN / LOSS / EXPIRED
voiceLine: "The paper remembers what the market said."
sass: "No live keys. No excuses. Just truth on paper."
qseal: 🜃∴🜂
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)


def resolve_paper_orders(conn, current_prices: dict) -> dict:
    """
    Resolve open paper orders against current market prices.
    current_prices: {"BTCUSDT": 65000.0, ...}
    Returns summary of resolved orders.
    """
    resolved = {"WIN": 0, "LOSS": 0, "EXPIRED": 0, "skipped": 0}
    now = datetime.now(timezone.utc)

    with conn.cursor() as cur:
        cur.execute("""
            SELECT order_id, asset, side, entry, stop_loss,
                   take_profit, expires_at, quantity, risk_amount
            FROM paper_orders
            WHERE outcome = 'OPEN'
              AND status = 'PAPER_FILLED'
              AND regime_version = 'v2_adx_ema_rsi'
        """)
        open_orders = cur.fetchall()

    for row in open_orders:
        (
            order_id,
            asset,
            side,
            entry,
            stop_loss,
            take_profit,
            expires_at,
            quantity,
            risk_amount,
        ) = row

        current_price = current_prices.get(asset)
        if current_price is None:
            resolved["skipped"] += 1
            continue

        price = Decimal(str(current_price))
        entry = Decimal(str(entry)) if entry else None
        sl = Decimal(str(stop_loss)) if stop_loss else None
        tp_list = [Decimal(str(t)) for t in take_profit] if take_profit else []
        tp = tp_list[0] if tp_list else None

        outcome = None
        exit_price = None

        # Check expiry first
        if expires_at and now > expires_at:
            outcome = "EXPIRED"
            exit_price = price

        elif side == "LONG":
            if sl and price <= sl:
                outcome = "LOSS"
                exit_price = sl
            elif tp and price >= tp:
                outcome = "WIN"
                exit_price = tp

        elif side == "SHORT":
            if sl and price >= sl:
                outcome = "LOSS"
                exit_price = sl
            elif tp and price <= tp:
                outcome = "WIN"
                exit_price = tp

        if outcome:
            # Calculate R-multiple
            r_multiple = None
            if risk_amount and risk_amount != 0 and entry and exit_price:
                if side == "LONG":
                    realized = (exit_price - entry) * (
                        Decimal(str(quantity)) if quantity else 1
                    )
                else:
                    realized = (entry - exit_price) * (
                        Decimal(str(quantity)) if quantity else 1
                    )
                r_multiple = float(realized / Decimal(str(risk_amount)))

            new_status = f"PAPER_{outcome}"

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE paper_orders SET
                        outcome      = %s,
                        exit_price   = %s,
                        r_multiple   = %s,
                        resolved_at  = %s,
                        status       = %s,
                        updated_at   = %s
                    WHERE order_id = %s
                """,
                    (
                        outcome,
                        float(exit_price),
                        r_multiple,
                        now,
                        new_status,
                        now,
                        order_id,
                    ),
                )
            conn.commit()
            resolved[outcome] += 1
            logger.info(
                f"Resolved {order_id} → {outcome} exit={exit_price} R={r_multiple}"
            )

    return resolved


def get_open_paper_orders(conn) -> list:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT order_id, asset FROM paper_orders
            WHERE outcome = 'OPEN'
              AND status = 'PAPER_FILLED'
              AND regime_version = 'v2_adx_ema_rsi'
        """)
        return cur.fetchall()
