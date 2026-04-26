#!/usr/bin/env python3
from __future__ import annotations
import json
import os
import signal
import subprocess
import time
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
PM2_SCANNER_NAME = os.environ.get("PM2_SCANNER_NAME", "idim-scanner")
LOGIC_VERSION = os.environ.get("LOGIC_VERSION", "unknown")
CONFIG_VERSION = os.environ.get("CONFIG_VERSION", "unknown")
START_TS = time.time()

app = FastAPI(title="Idim Ikang API", version="v1")


def db_conn():
    return psycopg2.connect(DATABASE_URL)


def scanner_state() -> str:
    try:
        result = subprocess.run(["pm2", "jlist"], check=True, capture_output=True, text=True)
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
        "service": "idim-api",
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
            """
            , (limit,)
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


@app.get("/history")
def history(
    limit: int = 100, 
    pair: Optional[str] = None, 
    side: Optional[str] = None, 
    outcome: Optional[str] = None,
    from_date: Optional[str] = None
):
    query = """
        SELECT signal_id, pair, ts, side, entry, stop_loss, take_profit, score, regime,
               logic_version, config_version, outcome, r_multiple, source, created_at, updated_at
        FROM signals
        WHERE 1=1
    """
    params = []
    
    if pair:
        query += " AND pair = %s"
        params.append(pair)
    if side:
        query += " AND side = %s"
        params.append(side)
    if outcome:
        query += " AND outcome = %s"
        params.append(outcome)
    if from_date:
        query += " AND ts >= %s"
        params.append(from_date)
        
    query += " ORDER BY ts DESC LIMIT %s"
    params.append(limit)
    
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
        
    return {"count": len(rows), "history": rows}


@app.post("/kill")
def kill():
    try:
        subprocess.run(["pm2", "stop", PM2_SCANNER_NAME], check=True, capture_output=True, text=True)
        with db_conn() as conn, conn.cursor() as cur:
            cur.execute(
                "INSERT INTO system_logs(level, component, event, details) VALUES (%s,%s,%s,%s::jsonb)",
                ("WARN", "api", "kill_switch_invoked", json.dumps({"pm2_process": PM2_SCANNER_NAME}))
            )
            conn.commit()
        return {"status": "stopped", "scanner": PM2_SCANNER_NAME}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=e.stderr or str(e))


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        # We need to handle disconnected clients during broadcast
        import uuid
        import decimal
        
        class CustomJSONEncoder(json.JSONEncoder):
            def default(self, obj):
                if isinstance(obj, datetime):
                    return obj.isoformat()
                if isinstance(obj, uuid.UUID):
                    return str(obj)
                if isinstance(obj, decimal.Decimal):
                    return float(obj)
                return super().default(obj)
                
        message_str = json.dumps(message, cls=CustomJSONEncoder)
        
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message_str)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # We just keep the connection open and wait for the background task to push data
            # Or we can accept ping/pong messages here
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def _poll_database_for_updates():
    last_signal_id = None
    last_log_id = None
    
    # Initialize the IDs to not broadcast old data on server start
    try:
        with db_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT id FROM signals ORDER BY id DESC LIMIT 1")
            res = cur.fetchone()
            if res: last_signal_id = res[0]
            
            cur.execute("SELECT id FROM system_logs ORDER BY id DESC LIMIT 1")
            res = cur.fetchone()
            if res: last_log_id = res[0]
    except Exception as e:
        print(f"Error initializing poller: {e}")
        
    while True:
        await asyncio.sleep(2.0)
        if not manager.active_connections:
            continue
            
        try:
            with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Check for new signals
                sig_query = "SELECT * FROM signals"
                if last_signal_id is not None:
                    sig_query += f" WHERE id > {last_signal_id}"
                sig_query += " ORDER BY id ASC"
                
                cur.execute(sig_query)
                signals = cur.fetchall()
                for sig in signals:
                    last_signal_id = max(last_signal_id or 0, sig['id'])
                    await manager.broadcast({"type": "new_signal", "data": dict(sig)})
                    
                # Check for new logs
                log_query = "SELECT * FROM system_logs"
                if last_log_id is not None:
                    log_query += f" WHERE id > {last_log_id}"
                log_query += " ORDER BY id ASC"
                
                cur.execute(log_query)
                logs = cur.fetchall()
                for log in logs:
                    last_log_id = max(last_log_id or 0, log['id'])
                    await manager.broadcast({"type": "new_log", "data": dict(log)})
                    
        except Exception as e:
             print(f"Polling error: {e}")
             await asyncio.sleep(5.0)

@app.on_event("startup")
async def startup_event():
    # Start the polling background task
    asyncio.create_task(_poll_database_for_updates())