#!/usr/bin/env python3
"""
Posterior Whitelist Generator (v2.0 — Cumulative-N Posterior Filter)

Generates whitelist.json from raw trades CSV.
Pocket identity: (policy, regime, side)
Qualification: cumulative-N, posterior P(true_WR >= threshold) >= min_posterior_pass_prob

Usage:
  python posterior_whitelist.py --trades-csv exports/trades.csv --whitelist-json observer_bundle/whitelist.json [--report-json exports/pocket_report.json]
"""
from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

# -------- CONFIG --------
MIN_N = 5
SUCCESS_WR_THRESHOLD = 0.50
MIN_POSTERIOR_PASS_PROB = 0.75

# Conservative prior: Beta(1,1) = uniform
PRIOR_ALPHA = 1.0
PRIOR_BETA = 1.0

# Pocket key fields
POCKET_FIELDS = ("policy", "regime", "side")


@dataclass
class PocketStats:
    policy: str
    regime: str
    side: str
    n: int
    wins: int
    losses: int
    unresolved: int
    observed_wr: float
    posterior_alpha: float
    posterior_beta: float
    posterior_mean_wr: float
    p_true_wr_ge_threshold: float

    @property
    def pocket_id(self) -> str:
        return f"{self.policy}|{self.regime}|{self.side}"


def load_trades_csv(path: str | Path) -> List[dict]:
    path = Path(path)
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = [dict(r) for r in reader]
    return rows


def normalize_outcome(value: str | None) -> str:
    if value is None:
        return "UNRESOLVED"
    v = value.strip().upper()
    if v in {"WIN", "LOSS", "UNRESOLVED"}:
        return v
    return "UNRESOLVED"


def beta_cdf_complement(
    alpha: float,
    beta: float,
    threshold: float,
    steps: int = 20000,
) -> float:
    """
    Numerically approximate P(X >= threshold) for X ~ Beta(alpha, beta).
    Midpoint rule integration over [threshold, 1.0].
    No scipy dependency.
    """
    if threshold <= 0.0:
        return 1.0
    if threshold >= 1.0:
        return 0.0

    def log_beta_func(a: float, b: float) -> float:
        return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)

    log_norm = -log_beta_func(alpha, beta)

    lo = threshold
    hi = 1.0
    width = (hi - lo) / steps
    total = 0.0

    for i in range(steps):
        x = lo + (i + 0.5) * width
        if x <= 0.0 or x >= 1.0:
            continue
        log_pdf = (
            (alpha - 1.0) * math.log(x)
            + (beta - 1.0) * math.log(1.0 - x)
            + log_norm
        )
        total += math.exp(log_pdf) * width

    return max(0.0, min(1.0, total))


def aggregate_pockets(rows: Iterable[dict]) -> List[PocketStats]:
    grouped: Dict[Tuple[str, str, str], Dict[str, int | str]] = {}

    for row in rows:
        policy = (row.get("policy") or "").strip()
        regime = (row.get("regime") or "").strip()
        side = (row.get("side") or "").strip().upper()
        outcome = normalize_outcome(row.get("outcome"))

        if not policy or not regime or side not in {"LONG", "SHORT"}:
            continue

        key = (policy, regime, side)
        if key not in grouped:
            grouped[key] = {
                "policy": policy,
                "regime": regime,
                "side": side,
                "n": 0,
                "wins": 0,
                "losses": 0,
                "unresolved": 0,
            }

        grouped[key]["n"] += 1
        if outcome == "WIN":
            grouped[key]["wins"] += 1
        elif outcome == "LOSS":
            grouped[key]["losses"] += 1
        else:
            grouped[key]["unresolved"] += 1

    pockets: List[PocketStats] = []

    for (_, _, _), g in grouped.items():
        wins = int(g["wins"])
        losses = int(g["losses"])
        unresolved = int(g["unresolved"])
        resolved = wins + losses

        observed_wr = wins / resolved if resolved > 0 else 0.0

        alpha = PRIOR_ALPHA + wins
        beta = PRIOR_BETA + losses

        posterior_mean = alpha / (alpha + beta)
        p_pass = beta_cdf_complement(alpha, beta, SUCCESS_WR_THRESHOLD)

        pockets.append(
            PocketStats(
                policy=str(g["policy"]),
                regime=str(g["regime"]),
                side=str(g["side"]),
                n=int(g["n"]),
                wins=wins,
                losses=losses,
                unresolved=unresolved,
                observed_wr=observed_wr,
                posterior_alpha=alpha,
                posterior_beta=beta,
                posterior_mean_wr=posterior_mean,
                p_true_wr_ge_threshold=p_pass,
            )
        )

    pockets.sort(
        key=lambda p: (
            p.p_true_wr_ge_threshold,
            p.posterior_mean_wr,
            p.n,
        ),
        reverse=True,
    )
    return pockets


def select_whitelist(pockets: Iterable[PocketStats]) -> List[PocketStats]:
    selected = []
    for p in pockets:
        if p.n < MIN_N:
            continue
        if p.p_true_wr_ge_threshold < MIN_POSTERIOR_PASS_PROB:
            continue
        selected.append(p)
    return selected


def select_watch_only(pockets: Iterable[PocketStats], qualifying: List[PocketStats]) -> List[PocketStats]:
    """Near-miss pockets: N >= MIN_N but posterior below threshold, sorted by proximity."""
    qualifying_ids = {p.pocket_id for p in qualifying}
    watch = []
    for p in pockets:
        if p.pocket_id in qualifying_ids:
            continue
        if p.n < MIN_N:
            continue
        if p.p_true_wr_ge_threshold >= 0.20:  # At least 20% posterior probability
            watch.append(p)
    return watch


def write_whitelist_json(
    qualifying: List[PocketStats],
    watch_only: List[PocketStats],
    output_path: str | Path,
) -> None:
    output_path = Path(output_path)
    payload = {
        "schema_version": "2.0",
        "selection_method": "cumulative_posterior_filter",
        "min_n": MIN_N,
        "success_wr_threshold": SUCCESS_WR_THRESHOLD,
        "min_posterior_pass_prob": MIN_POSTERIOR_PASS_PROB,
        "prior": {
            "alpha": PRIOR_ALPHA,
            "beta": PRIOR_BETA,
        },
        "pocket_fields": list(POCKET_FIELDS),
        "pockets": [
            {
                "pocket_id": p.pocket_id,
                "policy": p.policy,
                "regime": p.regime,
                "side": p.side,
                "n": p.n,
                "wins": p.wins,
                "losses": p.losses,
                "unresolved": p.unresolved,
                "observed_wr": round(p.observed_wr, 6),
                "posterior_mean_wr": round(p.posterior_mean_wr, 6),
                "p_true_wr_ge_threshold": round(p.p_true_wr_ge_threshold, 6),
            }
            for p in qualifying
        ],
        "watch_only": [
            {
                "pocket_id": p.pocket_id,
                "policy": p.policy,
                "regime": p.regime,
                "side": p.side,
                "n": p.n,
                "observed_wr": round(p.observed_wr, 6),
                "p_true_wr_ge_threshold": round(p.p_true_wr_ge_threshold, 6),
            }
            for p in watch_only
        ],
    }
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main(trades_csv: str, whitelist_json: str, report_json: str | None = None) -> None:
    rows = load_trades_csv(trades_csv)
    pockets = aggregate_pockets(rows)
    qualifying = select_whitelist(pockets)
    watch_only = select_watch_only(pockets, qualifying)

    write_whitelist_json(qualifying, watch_only, whitelist_json)

    if report_json:
        report = {
            "all_pockets": [asdict(p) for p in pockets],
            "qualifying_pockets": [asdict(p) for p in qualifying],
            "watch_only_pockets": [asdict(p) for p in watch_only],
        }
        Path(report_json).write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Loaded trades: {len(rows)}")
    print(f"All pockets: {len(pockets)}")
    print(f"Qualifying whitelist pockets: {len(qualifying)}")
    for p in qualifying:
        print(
            f"  ✅ {p.pocket_id} | n={p.n} | wins={p.wins} | losses={p.losses} | "
            f"obs_wr={p.observed_wr:.3f} | post_mean={p.posterior_mean_wr:.3f} | "
            f"p(true_wr>={SUCCESS_WR_THRESHOLD:.2f})={p.p_true_wr_ge_threshold:.3f}"
        )
    print(f"Watch-only pockets: {len(watch_only)}")
    for p in watch_only:
        print(
            f"  👁 {p.pocket_id} | n={p.n} | obs_wr={p.observed_wr:.3f} | "
            f"p(pass)={p.p_true_wr_ge_threshold:.3f}"
        )


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate posterior-filtered whitelist from raw trades CSV.")
    parser.add_argument("--trades-csv", required=True)
    parser.add_argument("--whitelist-json", required=True)
    parser.add_argument("--report-json", required=False)
    args = parser.parse_args()

    main(args.trades_csv, args.whitelist_json, args.report_json)
