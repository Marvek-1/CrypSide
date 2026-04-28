# CrypSide Champion Deployment Runbook
**Profile:** L50_S60_MF15_EXmedium_RGadaptive
**Stress test:** 5 seeds × 2,000 trades — rank #1 in all 5
**Expected performance:** WR 60.2%, PF 2.08, EV +0.39R/trade

---

## Pre-flight checklist (do BEFORE deploying)

- [ ] All PM2 services currently online: crypside-api, crypside-scanner, crypside-outcome-tracker, crypside-frontend, moedge-sentinel
- [ ] Backup current config to `config.live.backup.YYYYMMDD.py`
- [ ] Confirm collectors are fresh (funding, OI, LS ratio) — stale data = unreliable test
- [ ] Snapshot current live stats: win rate, PF, EV, signals/day, drawdown
- [ ] Confirm position-size is set to **1/4 of normal** for shake-down

---

## Deployment (3 settings — that's it)

```bash
# 1. Replace these 3 env vars (or the equivalent in config.py)
CRYPSIDE_PROB_FLOOR_SHORT=60          # was 58
CRYPSIDE_EXHAUSTION_STRICTNESS=medium # was high
CRYPSIDE_BTC_REGIME_MODE=adaptive     # was strict

# 2. Restart scanner (keep everything else running)
pm2 restart crypside-scanner

# 3. Tail the logs for the first 5 cycles
pm2 logs crypside-scanner --lines 200
```

---

## First-hour checklist

| Check | Expected | Action if fails |
|---|---|---|
| Scanner cycles complete | errors=0 | Rollback immediately |
| BTC regime log | UPTREND or STRONG_UPTREND (if market is up) | Inspect classifier |
| Signals emitted per cycle | >0 on most cycles | OK if a few zero cycles |
| Top kill gate | NOT exhaustion dominant | OK if <45% |
| API /signals returns | 200, non-empty | Rollback |

---

## Shake-down period (first 72 hours)

Run at **1/4 position size**. Watch these live:

1. GET /api/python/champion-drift every 1h — must stay GREEN or YELLOW
2. Win rate after 30+ trades: should trend toward 58–62%
3. Max drawdown: **abort if exceeds -25R** (2× stress worst-case)
4. Signals/day: should land in 6–8

If all green at 72h → scale to 1/2 size. At 168h (1 week) → full size.

---

## Rollback (if any red flag)

```bash
# Instant rollback — the old profile is preserved in ROLLBACK_PROFILE
CRYPSIDE_PROB_FLOOR_SHORT=58
CRYPSIDE_EXHAUSTION_STRICTNESS=high
CRYPSIDE_BTC_REGIME_MODE=strict
pm2 restart crypside-scanner
```

**Red flags that trigger rollback:**
- 3+ consecutive losing days
- Drawdown > 25R
- Win rate < 50% after 30+ trades
- Profit factor < 1.0 after 50+ trades
- Top killer % > 55%
- API errors or scanner crashes

---

## What success looks like at 7 days

- [ ] Win rate: 58–62%
- [ ] Profit factor: >1.5
- [ ] Expected R: >+0.25R
- [ ] Signals/day: 6–8
- [ ] Max drawdown: within -15R
- [ ] MoEdge buckets: monotonic (low ≤ mid ≤ high)
- [ ] Sentinel verdict: PREDICTIVE

If yes → you've crossed into pro-level territory. Congrats, Overlord.
