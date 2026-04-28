#!/usr/bin/env python3
import json
import os
import subprocess
import time
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, Query

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
PM2_SCANNER_NAME = os.environ.get("PM2_SCANNER_NAME", "crypside-scanner")
LOGIC_VERSION = os.environ.get("LOGIC_VERSION", "v1.5-quant-alpha")
CONFIG_VERSION = os.environ.get("CONFIG_VERSION", "v1.5-quant-alpha")
START_TS = time.time()

app = FastAPI(title="CrypSide API", version="v1")


def db_conn():
    return psycopg2.connect(DATABASE_URL)


def scanner_state() -> str:
    try:
        result = subprocess.run(
            ["pm2", "jlist"],
            check=True,
            capture_output=True,
            text=True,
            env={**os.environ, "PM2_HOME": "/home/idona/.pm2"}
        )
        processes = json.loads(result.stdout)
        for proc in processes:
            if proc.get("name") == PM2_SCANNER_NAME:
                return proc.get("pm2_env", {}).get("status", "degraded")
        return "stopped"
    except Exception:
        return "degraded"


@app.get("/status")
def status():
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT ts, pair, side, score, regime FROM signals ORDER BY ts DESC LIMIT 1")
        last_signal = cur.fetchone()

        cur.execute("SELECT ts, level, event, details FROM system_logs ORDER BY ts DESC LIMIT 1")
        last_log = cur.fetchone()
    return {
        "service": "crypside-api",
        "scanner_state": scanner_state(),
        "uptime_seconds": round(time.time() - START_TS, 1),
        "logic_version": LOGIC_VERSION,
        "config_version": CONFIG_VERSION,
        "scanner_pm2_name": PM2_SCANNER_NAME,
        "last_signal": last_signal,
        "last_log": last_log,
    }


@app.get("/signals")
def signals(limit: int = Query(50, ge=1, le=500)):
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT signal_id, pair, ts, side, entry, stop_loss, take_profit, score, regime,
                   reason_trace, logic_version, config_version, outcome, r_multiple
            FROM signals
            ORDER BY ts DESC
            LIMIT %s
            """,
            (limit,),
        )
        rows = cur.fetchall()
    return {"count": len(rows), "signals": rows}


@app.get("/stats")
def stats():
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                COUNT(*) AS total_signals,
                COUNT(*) FILTER (WHERE outcome = 'WIN') AS wins,
                COUNT(*) FILTER (WHERE outcome = 'LOSS') AS losses,
                COUNT(*) FILTER (WHERE outcome = 'EXPIRED') AS expired,
                COALESCE(SUM(CASE WHEN outcome = 'WIN' THEN r_multiple ELSE 0 END), 0) AS gross_win_r,
                COALESCE(ABS(SUM(CASE WHEN outcome = 'LOSS' THEN r_multiple ELSE 0 END)), 0) AS gross_loss_r,
                MIN(ts) AS first_ts,
                MAX(ts) AS last_ts,
                MAX(logic_version) AS logic_version,
                MAX(config_version) AS config_version
            FROM signals
            """
        )
        row = cur.fetchone() or {}

    total = int(row.get("total_signals") or 0)
    wins = int(row.get("wins") or 0)
    losses = int(row.get("losses") or 0)
    expired = int(row.get("expired") or 0)
    resolved = wins + losses

    win_rate = (wins / resolved * 100.0) if resolved > 0 else 0.0

    gross_win_r = float(row.get("gross_win_r") or 0.0)
    gross_loss_r = float(row.get("gross_loss_r") or 0.0)
    profit_factor = (gross_win_r / gross_loss_r) if gross_loss_r > 0 else (999.0 if gross_win_r > 0 else 0.0)

    first_ts = row.get("first_ts")
    last_ts = row.get("last_ts")
    if first_ts and last_ts and last_ts > first_ts:
        days = max((last_ts - first_ts).total_seconds() / 86400.0, 1.0)
        signals_per_day = total / days
    else:
        signals_per_day = float(total)

    return {
        "total_signals": total,
        "wins": wins,
        "losses": losses,
        "expired": expired,
        "win_rate": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "signals_per_day": round(signals_per_day, 4),
        "logic_version": row.get("logic_version") or LOGIC_VERSION,
        "config_version": row.get("config_version") or CONFIG_VERSION,
    }


@app.get("/kill-analytics")
def kill_analytics():
    """Track CrypSide gate rejection statistics from training_candidates."""
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # Gate rejection counts
        cur.execute(
            """
            SELECT
                rejection_gate,
                COUNT(*) AS killed_count,
                COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () AS kill_percentage
            FROM training_candidates
            WHERE rejection_gate IS NOT NULL
            GROUP BY rejection_gate
            ORDER BY killed_count DESC
            """
        )
        gate_stats = cur.fetchall()
        
        # Overall stats
        cur.execute(
            """
            SELECT
                COUNT(*) AS total_candidates,
                COUNT(*) FILTER (WHERE rejection_gate IS NULL) AS passed_gates,
                COUNT(*) FILTER (WHERE rejection_gate IS NOT NULL) AS killed_by_gates,
                COUNT(*) FILTER (WHERE rejection_gate IS NOT NULL) * 100.0 / COUNT(*) AS overall_kill_rate
            FROM training_candidates
            WHERE ts > NOW() - INTERVAL '7 days'
            """
        )
        overall = cur.fetchone()
        
        # Top killer over 24h
        cur.execute(
            """
            SELECT
                rejection_gate,
                COUNT(*) AS kill_count_24h
            FROM training_candidates
            WHERE rejection_gate IS NOT NULL
              AND ts > NOW() - INTERVAL '24 hours'
            GROUP BY rejection_gate
            ORDER BY kill_count_24h DESC
            LIMIT 1
            """
        )
        top_killer_24h = cur.fetchone()
        
    return {
        "gate_stats": gate_stats,
        "overall": overall,
        "top_killer_24h": top_killer_24h,
        "last_checked": time.time()
    }
