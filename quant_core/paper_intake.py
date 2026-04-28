import asyncio
import os
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import asyncpg
import psycopg2

from .confidence_gate import calculate_confidence_gate

# Load .env explicitly before importing config
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv

    load_dotenv(env_path)

from config import DATABASE_URL


async def get_pool():
    # Use DATABASE_URL from config, fallback to manual construction
    db_url = DATABASE_URL or os.getenv("DATABASE_URL")
    if db_url:
        print(f"[PAPER_INTAKE] Using DATABASE_URL: {db_url[:30]}...")
        return await asyncpg.create_pool(dsn=db_url)

    db_user = os.getenv("DB_USER") or os.getenv("POSTGRES_USER", "postgres")
    db_pass = os.getenv("DB_PASS") or os.getenv("POSTGRES_PASSWORD", "mostar123")
    db_name = os.getenv("DB_NAME") or os.getenv("POSTGRES_DB", "idim_ikang")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = int(os.getenv("DB_PORT", "5433"))

    print(f"[PAPER_INTAKE] Manual connection: {db_user}@{db_host}:{db_port}/{db_name}")
    return await asyncpg.create_pool(
        user=db_user,
        password=db_pass,
        database=db_name,
        host=db_host,
        port=db_port,
    )


async def check_kill_switch() -> bool:
    """Check if kill switch is active. If True, stop all paper intake."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            result = await conn.fetchval(
                "SELECT value FROM settings WHERE key = 'kill_switch'"
            )
            return result == "true"
    except Exception:
        return False


# ── Gate helpers ──────────────────────────────────────────


async def check_kill_switch_env() -> bool:
    """Env-based kill switch — fastest possible stop."""
    return os.getenv("CRYPSIDE_KILL_SWITCH", "false").lower() == "true"


def _calculate_gate_sync():
    """
    Run confidence gate using the existing synchronous calculator.
    Kept isolated so async caller can offload it safely.
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required for confidence gate calculation")

    conn = psycopg2.connect(database_url)
    try:
        return calculate_confidence_gate(conn)
    finally:
        conn.close()


async def get_gate_status(pool) -> object:
    """
    Fetch current confidence gate state.

    calculate_confidence_gate is sync, so run it in a worker thread
    to avoid blocking paper_intake's async event loop.
    """
    return await asyncio.to_thread(_calculate_gate_sync)


async def log_gate_check(pool, intent_id: str, gate) -> None:
    """
    Write gate status to semantic_reviews for full audit trail.
    Every intent processed carries a gate snapshot.
    """
    async with pool.acquire() as conn:
        try:
            await conn.execute(
                """
                INSERT INTO semantic_reviews
                  (signal_id, intent_id, status, reason,
                   mo_lingua_packet, execution_mode,
                   live_execution, qseal)
                SELECT signal_id, intent_id::uuid, $1, $2, $3,
                       'paper', false, '🜃∴🜂'
                FROM execution_intents
                WHERE intent_id = $4::uuid
                """,
                f"GATE_{gate.status}",
                gate.verdict,
                gate.mo_lingua,
                intent_id,
            )
        except Exception as e:
            print(f"[PAPER_INTAKE] Gate log failed for {intent_id}: {e}")


async def fetch_approved_intents(pool) -> list:
    """Fetch all execution_intents with APPROVED_FOR_PAPER status."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT 
                intent_id, signal_id, asset, side, entry, stop_loss, take_profit,
                risk_class, max_risk_pct, expires_at, created_at
            FROM execution_intents
            WHERE status = 'APPROVED_FOR_PAPER'
            AND consumed_at IS NULL
            ORDER BY created_at ASC
            LIMIT 100
            """
        )
        return [dict(row) for row in rows]


async def simulate_fill(intent: dict) -> dict:
    """Simulate a fill with realistic slippage."""
    entry = float(intent.get("entry", 0))
    slippage_pct = random.uniform(0.05, 0.15)
    slippage = entry * (slippage_pct / 100)
    filled_at = entry + slippage if intent.get("side") == "BUY" else entry - slippage

    fill_time = datetime.now(timezone.utc) + timedelta(seconds=random.randint(1, 10))

    return {
        "filled_at": round(filled_at, 2),
        "fill_time": fill_time,
        "sim_slippage_pct": round(slippage_pct, 4),
    }


async def write_paper_order(pool, intent: dict, fill_result: dict) -> str:
    """Write a simulated paper order."""
    async with pool.acquire() as conn:
        order_id = await conn.fetchval(
            """
            INSERT INTO paper_orders (
                intent_id, signal_id, asset, side, entry, stop_loss, take_profit,
                filled_at, fill_time, status, fill_mode, sim_slippage_pct
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING order_id
            """,
            intent["intent_id"],
            intent["signal_id"],
            intent["asset"],
            intent["side"],
            intent["entry"],
            intent["stop_loss"],
            intent["take_profit"],
            fill_result["filled_at"],
            fill_result["fill_time"],
            "PAPER_FILLED",
            "SIMULATED",
            fill_result["sim_slippage_pct"],
        )

        # Mark intent as consumed
        await conn.execute(
            """
            UPDATE execution_intents
            SET consumed_at = NOW(), consumed_by = 'paper_intake'
            WHERE intent_id = $1
            """,
            intent["intent_id"],
        )

        return order_id


async def run_paper_intake():
    """Main paper intake loop."""
    pool = await get_pool()

    print("[PAPER_INTAKE] Starting paper intake service...")

    while True:
        try:
            # Check kill switch
            if await check_kill_switch():
                print("[PAPER_INTAKE] Kill switch active. Pausing.")
                await asyncio.sleep(30)
                continue

            # Fetch approved intents
            intents = await fetch_approved_intents(pool)

            if not intents:
                print("[PAPER_INTAKE] No approved intents. Waiting...")
                await asyncio.sleep(5)
                continue

            print(f"[PAPER_INTAKE] Found {len(intents)} approved intents")

            for intent in intents:
                # Simulate fill
                fill_result = await simulate_fill(intent)

                # Write paper order
                order_id = await write_paper_order(pool, intent, fill_result)

                print(
                    f"[PAPER_INTAKE] Paper order {order_id} created for {intent['asset']} "
                    f"@ {fill_result['filled_at']} (slippage: {fill_result['sim_slippage_pct']}%)"
                )

            await asyncio.sleep(2)

        except Exception as e:
            print(f"[PAPER_INTAKE] Error: {e}")
            await asyncio.sleep(5)


async def single_pass():
    """
    Single intake cycle with gate enforcement.
    Kill switch → Gate check → Process intents.

    Gate status is logged for audit, but Phase 2.2 never escalates to live.
    Paper remains paper.
    """
    pool = await get_pool()

    # 1. Env kill switch — fastest check
    if await check_kill_switch_env():
        print("⛔ CRYPSIDE_KILL_SWITCH=true — intake halted 🜃∴🜂")
        return {"status": "KILL_SWITCH_ACTIVE", "processed": 0}

    # 2. DB kill switch — existing check
    if await check_kill_switch():
        print("⛔ DB kill switch active — intake halted 🜃∴🜂")
        return {"status": "KILL_SWITCH_ACTIVE", "processed": 0}

    # 3. Gate status check — log but never block paper
    gate = await get_gate_status(pool)

    print(
        f"🜄 Gate: {gate.status} | "
        f"Signals: {gate.signal_count}/{200} | "
        f"PF: {gate.profit_factor:.4f} | "
        f"{gate.mo_lingua}"
    )

    # 4. Fetch and process approved intents
    intents = await fetch_approved_intents(pool)

    if not intents:
        print("🜄 No approved intents. River waiting.")
        return {
            "status": "NO_INTENTS",
            "processed": 0,
            "gate": gate.status,
            "mo_lingua": gate.mo_lingua,
        }

    processed = 0

    for intent in intents:
        try:
            # Log gate state against this intent
            await log_gate_check(pool, str(intent["intent_id"]), gate)

            # Simulate fill
            fill_result = await simulate_fill(intent)

            # Write paper order
            order_id = await write_paper_order(pool, intent, fill_result)

            print(
                f"🜂 Paper order {order_id} | "
                f"{intent['asset']} {intent['side']} | "
                f"Gate: {gate.status}"
            )

            processed += 1

        except Exception as e:
            print(f"[PAPER_INTAKE] Intent {intent.get('intent_id')} failed: {e}")
            continue

    return {
        "status": "COMPLETE",
        "processed": processed,
        "gate": gate.status,
        "mo_lingua": gate.mo_lingua,
    }


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--single":
        asyncio.run(single_pass())
    else:
        asyncio.run(run_paper_intake())
