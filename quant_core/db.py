import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone

import asyncpg
from config import DATABASE_URL
from observer_bundle.config import CURRENT_POLICY_VERSION as POLICY_VERSION

sys.path.insert(0, "/home/idona/MoStar/MoStar-Grid")


# ─── Semantic review (Phase 2af) ──────────────────────────────────────────


async def trigger_semantic_review(signal_data: dict, signal_id: str, side_value: str, entry_value: float, tp_value):
    """
    Standalone semantic review function for scanner integration.
    Calls MoScriptEngine to validate signals and creates execution_intents if approved.
    """
    from core.grid_orchestrator.core_engine.moscript_engine import MoScriptEngine

    engine = MoScriptEngine()
    result = await engine.execute_ritual(
        "SIGNAL_CERTIFY",
        {
            "signal_id": signal_id,
            "regime_version": signal_data.get("regime_version", "v2_adx_ema_rsi"),
            "score": float(signal_data.get("score", 0)),
            "execution_grade": signal_data.get("execution_grade", False),
            "expires_at": signal_data.get("expires_at"),
            "asset": signal_data.get("pair"),
            "risk_class": signal_data.get("risk_class", "medium"),
        },
    )

    # Get pool for database operations
    db_url = os.getenv("DATABASE_URL") or DATABASE_URL
    if not db_url:
        raise RuntimeError("DATABASE_URL is required for semantic review")

    pool = await asyncpg.create_pool(dsn=db_url)

    # Persist to semantic_reviews table
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO semantic_reviews (
                signal_id, intent_id, status, reason, mo_lingua_packet,
                regime_version, score, risk_class, execution_mode, live_execution
            ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            signal_id,
            result.get("status"),
            result.get("reason"),
            result.get("mo_lingua_packet"),
            signal_data.get("regime_version", "v2_adx_ema_rsi"),
            float(signal_data.get("score", 0)),
            signal_data.get("risk_class", "medium"),
            result.get("execution_mode"),
            result.get("live_execution", False),
        )

    # If approved, persist to execution_intents table
    if result.get("status") == "APPROVED_FOR_PAPER":
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO execution_intents (
                    signal_id, asset, side, entry, stop_loss, take_profit,
                    status, execution_mode, live_execution, requires_manual,
                    mo_lingua_packet, risk_class, max_risk_pct,
                    research_only, confidence_gate_eligible, research_reason
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                """,
                signal_id,
                signal_data.get("pair"),
                str(side_value).upper(),
                float(entry_value),
                float(signal_data["stop_loss"]),
                [float(tp_value)] if tp_value else [],
                "APPROVED_FOR_PAPER",
                "paper",
                False,
                True,
                result.get("mo_lingua_packet"),
                signal_data.get("risk_class", "medium"),
                0.5,
                signal_data.get("research_only", False),
                signal_data.get("confidence_gate_eligible", True),
                signal_data.get("research_reason"),
            )

    await pool.close()
    return result


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
            json.dumps(
                {
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ),
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

    ts_value = (
        signal_data.get("ts")
        or signal_data.get("timestamp")
        or datetime.now(timezone.utc)
    )

    side_value = signal_data.get("side") or signal_data.get("direction")
    if not side_value:
        raise ValueError("Signal rejected: Missing required field 'side'/'direction'")

    entry_value = signal_data.get("entry")
    if entry_value is None:
        entry_range = signal_data.get("entry_range") or {}
        entry_value = entry_range.get("min")
    if entry_value is None:
        raise ValueError(
            "Signal rejected: Missing required field 'entry' or 'entry_range.min'"
        )

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
        raise ValueError(
            "policy_version is required — refusing to insert signal without identity"
        )

    regime_version_value = signal_data.get("regime_version", "v2_adx_ema_rsi")
    signal_id = signal_data.get("signal_id", str(uuid.uuid4()))

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO signals (
                signal_id, pair, ts, side, entry, stop_loss, take_profit,
                score, regime, reason_trace, logic_version, config_version, source, policy_version, regime_version
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)
            """,
            signal_id,
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
            str(regime_version_value),
        )

    async def _trigger_semantic_review(signal_data: dict, signal_id: str, side_value: str, entry_value: float, tp_value):
        from core.grid_orchestrator.core_engine.moscript_engine import MoScriptEngine

        engine = MoScriptEngine()
        result = await engine.execute_ritual(
            "SIGNAL_CERTIFY",
            {
                "signal_id": signal_id,
                "regime_version": signal_data.get("regime_version", "v2_adx_ema_rsi"),
                "score": float(signal_data.get("score", 0)),
                "execution_grade": signal_data.get("execution_grade", False),
                "expires_at": signal_data.get("expires_at"),
                "asset": signal_data.get("pair"),
                "risk_class": signal_data.get("risk_class", "medium"),
            },
        )

        # Persist to semantic_reviews table
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO semantic_reviews (
                    signal_id, intent_id, status, reason, mo_lingua_packet,
                    regime_version, score, risk_class, execution_mode, live_execution
                ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                signal_id,
                result.get("status"),
                result.get("reason"),
                result.get("mo_lingua_packet"),
                signal_data.get("regime_version", "v2_adx_ema_rsi"),
                float(signal_data.get("score", 0)),
                signal_data.get("risk_class", "medium"),
                result.get("execution_mode"),
                result.get("live_execution", False),
            )

        # If approved, persist to execution_intents table
        if result.get("status") == "APPROVED_FOR_PAPER":
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO execution_intents (
                        signal_id, asset, side, entry, stop_loss, take_profit,
                        status, execution_mode, live_execution, requires_manual,
                        mo_lingua_packet, risk_class, max_risk_pct,
                        research_only, confidence_gate_eligible, research_reason
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                    """,
                    signal_id,
                    signal_data.get("pair"),
                    str(side_value).upper(),
                    float(entry_value),
                    float(signal_data["stop_loss"]),
                    [float(tp_value)] if tp_value else [],
                    "APPROVED_FOR_PAPER",
                    "paper",
                    False,
                    True,
                    result.get("mo_lingua_packet"),
                    signal_data.get("risk_class", "medium"),
                    0.5,
                    signal_data.get("research_only", False),
                    signal_data.get("confidence_gate_eligible", True),
                    signal_data.get("research_reason"),
                )

    try:
        asyncio.create_task(trigger_semantic_review(signal_data, signal_id, side_value, entry_value, tp_value))
    except RuntimeError:
        asyncio.run(trigger_semantic_review(signal_data, signal_id, side_value, entry_value, tp_value))
