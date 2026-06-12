#!/usr/bin/env python3
"""
MoEdge EV Sentinel Service

A standalone service that monitors MoEdge bucket EV and provides:
- EV bucket calculations from training_candidates
- Status determination (COLLECTING_DATA, MOEDGE_PREDICTIVE, MOEDGE_MISWEIGHTED, SYSTEM_EDGE_NEGATIVE)
- Telegram alerts on status change
- API endpoint for frontend consumption
"""
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]
PORT = int(os.environ.get("MOEDGE_SENTINEL_PORT", "3010"))
CHECK_INTERVAL_SECONDS = int(os.environ.get("MOEDGE_SENTINEL_INTERVAL", "1800"))  # 30 min

app = FastAPI(title="MoEdge EV Sentinel", version="v1")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def db_conn():
    return psycopg2.connect(DATABASE_URL)


def compute_ev_buckets() -> Dict:
    """Calculate EV buckets from training_candidates."""
    with db_conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                CASE
                    WHEN score < 15 THEN '00_15'
                    WHEN score < 30 THEN '15_30'
                    WHEN score < 45 THEN '30_45'
                    ELSE '45_plus'
                END AS bucket,
                COUNT(*) AS n,
                COALESCE(AVG(CAST(trace_data->>'realized_r' AS NUMERIC)), 0) AS ev
            FROM training_candidates
            WHERE score IS NOT NULL
              AND trace_data->>'realized_r' IS NOT NULL
            GROUP BY bucket
            ORDER BY bucket
            """
        )
        rows = cur.fetchall()
    
    return {r['bucket']: {'n': r['n'], 'ev': r['ev']} for r in rows}


def determine_status(buckets: Dict) -> str:
    """Determine sentinel status based on EV buckets."""
    n_15_30 = buckets.get('15_30', {}).get('n', 0) or 0
    n_30_45 = buckets.get('30_45', {}).get('n', 0) or 0
    ev_15_30 = buckets.get('15_30', {}).get('ev', 0) or 0
    ev_30_45 = buckets.get('30_45', {}).get('ev', 0) or 0
    ev_45_plus = buckets.get('45_plus', {}).get('ev', 0) or 0
    ev_00_15 = buckets.get('00_15', {}).get('ev', 0) or 0
    
    if min(n_15_30, n_30_45) < 20:
        return "COLLECTING_DATA"
    elif ev_15_30 > ev_30_45:
        return "MOEDGE_MISWEIGHTED"
    elif ev_30_45 > ev_15_30:
        return "MOEDGE_PREDICTIVE"
    elif all(ev < 0 for ev in [ev_00_15, ev_15_30, ev_30_45, ev_45_plus]):
        return "SYSTEM_EDGE_NEGATIVE"
    else:
        return "NEUTRAL"


def get_status_meaning(status: str) -> str:
    """Get human-readable meaning for status."""
    meanings = {
        "COLLECTING_DATA": "Insufficient data for analysis (need 20+ samples per bucket)",
        "MOEDGE_PREDICTIVE": "MoEdge has predictive value. Higher scores are improving expectancy.",
        "MOEDGE_MISWEIGHTED": "MoEdge may be misweighted for CrypSide. Lower scores outperforming higher scores.",
        "SYSTEM_EDGE_NEGATIVE": "All buckets negative. Issue likely CrypSide exit/market regime, not MoEdge.",
        "NEUTRAL": "No clear signal from EV buckets."
    }
    return meanings.get(status, "Unknown status")


# State tracking
_last_status = None


@app.get("/sentinel")
def sentinel():
    """Get current MoEdge sentinel status."""
    buckets = compute_ev_buckets()
    status = determine_status(buckets)
    meaning = get_status_meaning(status)
    
    ev_00_15 = buckets.get('00_15', {}).get('ev', 0) or 0
    ev_15_30 = buckets.get('15_30', {}).get('ev', 0) or 0
    ev_30_45 = buckets.get('30_45', {}).get('ev', 0) or 0
    ev_45_plus = buckets.get('45_plus', {}).get('ev', 0) or 0
    
    return {
        "status": status,
        "meaning": meaning,
        "buckets": buckets,
        "threshold_check": {
            "00_15_ev": round(ev_00_15, 4),
            "15_30_ev": round(ev_15_30, 4),
            "30_45_ev": round(ev_30_45, 4),
            "45_plus_ev": round(ev_45_plus, 4),
        },
        "last_checked": time.time()
    }


@app.get("/ev-live")
def ev_live():
    """Live EV dashboard query - bucket comparison and status."""
    buckets = compute_ev_buckets()
    status = determine_status(buckets)
    meaning = get_status_meaning(status)
    
    ev_00_15 = buckets.get('00_15', {}).get('ev', 0) or 0
    ev_15_30 = buckets.get('15_30', {}).get('ev', 0) or 0
    ev_30_45 = buckets.get('30_45', {}).get('ev', 0) or 0
    ev_45_plus = buckets.get('45_plus', {}).get('ev', 0) or 0
    
    n_00_15 = buckets.get('00_15', {}).get('n', 0) or 0
    n_15_30 = buckets.get('15_30', {}).get('n', 0) or 0
    n_30_45 = buckets.get('30_45', {}).get('n', 0) or 0
    n_45_plus = buckets.get('45_plus', {}).get('n', 0) or 0
    
    return {
        "status": status,
        "meaning": meaning,
        "buckets": [
            {"bucket": "00_15", "ev": round(ev_00_15, 4), "n": n_00_15},
            {"bucket": "15_30", "ev": round(ev_15_30, 4), "n": n_15_30},
            {"bucket": "30_45", "ev": round(ev_30_45, 4), "n": n_30_45},
            {"bucket": "45_plus", "ev": round(ev_45_plus, 4), "n": n_45_plus},
        ],
        "comparison": {
            "15_30_vs_30_45": round(ev_15_30 - ev_30_45, 4),
            "30_45_vs_45_plus": round(ev_30_45 - ev_45_plus, 4),
            "trend": "improving" if ev_30_45 > ev_15_30 else "declining" if ev_15_30 > ev_30_45 else "neutral"
        },
        "last_checked": time.time()
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {"status": "healthy", "service": "moedge-sentinel"}


def send_telegram_alert(status: str, buckets: Dict):
    """Send Telegram alert on status change (placeholder - integrate with mostar-telegram)."""
    # This will be integrated with mostar-telegram via orchestrator
    ev_15_30 = buckets.get('15_30', {}).get('ev', 0) or 0
    ev_30_45 = buckets.get('30_45', {}).get('ev', 0) or 0
    ev_45_plus = buckets.get('45_plus', {}).get('ev', 0) or 0
    n_15_30 = buckets.get('15_30', {}).get('n', 0) or 0
    n_30_45 = buckets.get('30_45', {}).get('n', 0) or 0
    
    alert_msg = f"""
🧠 MoEdge EV Sentinel

Status: {status}
15–30 EV: {ev_15_30:+.3f}R (n={n_15_30})
30–45 EV: {ev_30_45:+.3f}R (n={n_30_45})
45+ EV: {ev_45_plus:+.3f}R

Meaning:
{get_status_meaning(status)}

Time: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}
"""
    logger.info(f"[TELEGRAM ALERT] Status changed to: {status}")
    logger.info(f"[TELEGRAM ALERT] Message: {alert_msg}")
    # TODO: Integrate with mostar-telegram via orchestrator


def check_status_change():
    """Check for status changes and alert if needed."""
    global _last_status
    
    try:
        buckets = compute_ev_buckets()
        status = determine_status(buckets)
        
        if _last_status is None:
            _last_status = status
            logger.info(f"[SENTINEL] Initial status: {status}")
        elif status != _last_status:
            logger.info(f"[SENTINEL] Status changed: {_last_status} -> {status}")
            send_telegram_alert(status, buckets)
            _last_status = status
    except Exception as e:
        logger.error(f"[SENTINEL] Check failed: {e}")


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"[SENTINEL] Starting MoEdge Sentinel on port {PORT}")
    logger.info(f"[SENTINEL] Check interval: {CHECK_INTERVAL_SECONDS}s")
    
    # Start background checker
    import threading
    
    def background_checker():
        while True:
            time.sleep(CHECK_INTERVAL_SECONDS)
            check_status_change()
    
    checker_thread = threading.Thread(target=background_checker, daemon=True)
    checker_thread.start()
    
    # Run initial check
    check_status_change()
    
    # Start API server
    uvicorn.run(app, host="127.0.0.1", port=PORT)
