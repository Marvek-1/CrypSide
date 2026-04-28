"""
Gate 4: Policy Whitelist Gate (v2.0 — Posterior-filtered)

Pocket identity: (policy, regime, side)
Qualification: cumulative-N posterior filter from raw trade rows.
Only pockets with P(true_WR >= threshold) >= min_posterior_pass_prob pass.

Whitelist schema v2.0 loaded from whitelist.json.
"""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

WHITELIST_PATH = os.environ.get(
    "G4_WHITELIST_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "whitelist.json")
)

_cache_payload: Optional[Dict] = None
_cache_index: Dict[str, Dict[str, Any]] = {}
_cache_watch: Dict[str, Dict[str, Any]] = {}


def _load_whitelist() -> None:
    global _cache_payload, _cache_index, _cache_watch
    try:
        path = Path(WHITELIST_PATH)
        if not path.exists():
            logger.warning("[G4] whitelist.json not found at %s — G4 will block all", path)
            _cache_payload = {}
            _cache_index = {}
            _cache_watch = {}
            return
        _cache_payload = json.loads(path.read_text(encoding="utf-8"))
        _cache_index = {
            str(p["pocket_id"]): p
            for p in _cache_payload.get("pockets", [])
        }
        _cache_watch = {
            str(p["pocket_id"]): p
            for p in _cache_payload.get("watch_only", [])
        }
        n_pockets = len(_cache_index)
        n_watch = len(_cache_watch)
        logger.info("[G4] Whitelist loaded: %d qualifying pockets, %d watch-only from %s", n_pockets, n_watch, path)
    except Exception as e:
        logger.error("[G4] Failed to load whitelist: %s — G4 will block all", e)
        _cache_payload = {}
        _cache_index = {}
        _cache_watch = {}


def reload_whitelist() -> None:
    """Force reload whitelist from disk (for hot updates)."""
    _load_whitelist()


def _pocket_id(policy: str, regime: str, side: str) -> str:
    return f"{policy}|{regime}|{side.upper()}"


def apply_g4_whitelist(signal: dict) -> Tuple[bool, str]:
    """
    Gate 4: Posterior-filtered whitelist gate.

    Signal dict must contain:
      - policy: current sprint policy name
      - regime: market regime string
      - side: LONG or SHORT

    Returns (allowed, reason).
    """
    global _cache_index
    if not _cache_index:
        _load_whitelist()

    policy = signal.get("policy", "unknown")
    regime = signal.get("regime", "UNKNOWN")
    side = (signal.get("side") or "UNKNOWN").upper()

    pid = _pocket_id(policy, regime, side)

    # Check qualifying pockets
    if pid in _cache_index:
        meta = _cache_index[pid]
        logger.info(
            "[G4_PASS] pocket=%s obs_wr=%.1f%% post_mean=%.1f%% n=%d",
            pid, meta.get("observed_wr", 0) * 100,
            meta.get("posterior_mean_wr", 0) * 100, meta.get("n", 0)
        )
        return True, ""

    # Log watch-only near-misses
    if pid in _cache_watch:
        meta = _cache_watch[pid]
        logger.info(
            "[G4_WATCH_BLOCK] pocket=%s obs_wr=%.1f%% p_pass=%.1f%% n=%d (watch-only, not qualified)",
            pid, meta.get("observed_wr", 0) * 100,
            meta.get("p_true_wr_ge_threshold", 0) * 100, meta.get("n", 0)
        )
        return False, f"G4_POCKET_NOT_QUALIFIED({pid})"

    return False, f"G4_POCKET_MISS({pid})"


def get_whitelist_status() -> Dict[str, Any]:
    """Return current whitelist status for diagnostics."""
    if not _cache_payload:
        _load_whitelist()
    return {
        "loaded": bool(_cache_payload),
        "schema_version": _cache_payload.get("schema_version", "unknown"),
        "qualifying_pockets": list(_cache_index.keys()),
        "watch_only_pockets": list(_cache_watch.keys()),
        "selection_method": _cache_payload.get("selection_method", "unknown"),
        "min_n": _cache_payload.get("min_n", 0),
        "success_wr_threshold": _cache_payload.get("success_wr_threshold", 0),
        "min_posterior_pass_prob": _cache_payload.get("min_posterior_pass_prob", 0),
    }
