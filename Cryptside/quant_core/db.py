import asyncpg
import os
from datetime import datetime, timezone
import json
from config import DATABASE_URL
from observer_bundle.config import CURRENT_POLICY_VERSION as POLICY_VERSION

async def get_pool():
    if DATABASE_URL:
        return await asyncpg.create_pool(dsn=DATABASE_URL)

    db_user = os.getenv("DB_USER") or os.getenv("POSTGRES_USER", "postgres")
    db_pass = os.getenv("DB_PASS") or os.getenv("POSTGRES_PASSWORD", "")
    db_name = os.getenv("DB_NAME") or os.getenv("POSTGRES_DB", "idim_ikang")
    db_host = os.getenv("DB_HOST", "localhost")
    db_port = int(os.getenv("DB_PORT", "5432"))

    return await asyncpg.create_pool(
        user=db_user,
        password=db_pass,
        database=db_name,
        host=db_host,
        port=db_port,
    )

async def append_log(pool, event_type: str, message: str):
    """Append-only logging to system_logs. No updates, no deletes."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO system_logs(level, component, event, details)
            VALUES ($1, $2, $3, $4::jsonb)
            """,
            "INFO",
            "quant_core",
            event_type,
            json.dumps({"message": message, "timestamp": datetime.now(timezone.utc).isoformat()}),
        )

async def append_signal(pool, signal_data: dict):
    """
    Append-only signal storage.
    Aligned to CrypSide signals schema consumed by API endpoints.
    """
    required_fields = ["pair", "score", "stop_loss", "logic_version", "config_version"]

    for f in required_fields:
        if f not in signal_data or signal_data[f] is None:
            raise ValueError(f"Signal rejected: Missing required field '{f}'")

    ts_value = signal_data.get("ts") or signal_data.get("timestamp") or datetime.now(timezone.utc)

    side_value = signal_data.get("side") or signal_data.get("direction")
    if not side_value:
        raise ValueError("Signal rejected: Missing required field 'side'/'direction'")

    entry_value = signal_data.get("entry")
    if entry_value is None:
        entry_range = signal_data.get("entry_range") or {}
        entry_value = entry_range.get("min")
    if entry_value is None:
        raise ValueError("Signal rejected: Missing required field 'entry' or 'entry_range.min'")

    tp_value = signal_data.get("take_profit")
    if isinstance(tp_value, list):
        if tp_value:
            first_tp = tp_value[0]
            if isinstance(first_tp, dict):
                tp_value = first_tp.get("price")
    elif isinstance(tp_value, dict):
        tp_value = tp_value.get("price") or tp_value.get("tp2") or tp_value.get("tp1")

    if tp_value is None:
        tp_value = signal_data.get("tp2") or signal_data.get("tp1")
    if tp_value is None:
        raise ValueError("Signal rejected: Missing required take-profit field")

    reason_trace = signal_data.get("reason_trace") or {}
    regime_value = signal_data.get("regime", "UNKNOWN")
    source_value = signal_data.get("source", "quant_core")

    if not POLICY_VERSION:
        raise ValueError("policy_version is required — refusing to insert signal without identity")

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO signals (
                pair, ts, side, entry, stop_loss, take_profit,
                score, regime, reason_trace, logic_version, config_version, source, policy_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
            """,
            signal_data["pair"],
            ts_value,
            str(side_value).upper(),
            float(entry_value),
            float(signal_data["stop_loss"]),
            float(tp_value),
            float(signal_data["score"]),
            str(regime_value),
            json.dumps(reason_trace),
            signal_data["logic_version"],
            signal_data["config_version"],
            str(source_value),
            POLICY_VERSION,
        )
