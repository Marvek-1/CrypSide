"""
╔══════════════════════════════════════════════════════════════════════════════╗
║          IDIM IKANG — SOVEREIGN SIGNAL ARCHITECTURE v2.0                   ║
║          Odù Transition Geometry + Semantic pwin Gate                       ║
║                                                                              ║
║          Designed by: The Flame Architect                                    ║
║          Validated by: Wolfee                                                ║
║          Grounded in: Ifá computational framework (256 Odù corpus)          ║
║                                                                              ║
║          Status: APPROVED FOR BUILD                                          ║
║          Old strategy: OBSOLETE                                              ║
║          Live trading: BLOCKED until pwin model validated                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 0 — GROUND TRUTH (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What we are NOT trading:
    ✗ regime
    ✗ transition
    ✗ indicator congruence

What we ARE trading:
    ✓ predictability of outcome
      conditioned on semantic transition geometry

The edge lives in:
    P(win | equivalence_class, regime, hour, family, symbol)

Ifá contribution:
    Odù ≠ label
    Odù = structured semantic state vector
    XOR = group algebra over state space
    Semantic grounding = reason equivalence classes are compressible
                         and interpretable — not arbitrary

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 1 — 16-BIT SEMANTIC ENCODING (THE FOUNDATION)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each market state is encoded as a 16-bit vector.
Ifá uses 4-bit Odù × 2 = 8-bit.
We generalize to 4 semantic layers × 4 bits = 16-bit.
This is not extension by addition — it is extension by correspondence.

BIT LAYOUT:
┌─────────────────────────────────────────────────────────────┐
│ Bits 15-12 │ Bits 11-8  │ Bits 7-4   │ Bits 3-0            │
│ LAYER 4    │ LAYER 3    │ LAYER 2    │ LAYER 1             │
│ CONTEXT    │ INTENT     │ FAMILY     │ STRUCTURE           │
└─────────────────────────────────────────────────────────────┘

LAYER 1 — STRUCTURE (bits 0–3): Regime state
    0000 → RANGING
    0001 → UPTREND
    0011 → STRONG_UPTREND
    0100 → DOWNTREND
    1100 → STRONG_DOWNTREND
    Rule: EMA spread and ATR determine this. Already computed in scanner.

LAYER 2 — FAMILY (bits 4–7): Dominant signal family
    0000 → NONE / weak
    0001 → TREND_FOLLOW  (EMA alignment dominant)
    0010 → MOMENTUM      (MACD dominant)
    0100 → OSCILLATOR    (RSI dominant)
    1000 → VOLUME        (volume confirmation dominant)
    Rule: highest-weighted component in scoring matrix sets the bit.
          Multiple bits allowed if score components are close (±5 pts).

LAYER 3 — INTENT (bits 8–11): Trade direction and policy
    bit 8  → LONG side active
    bit 9  → SHORT side active
    bit 10 → policy flag: 0=conservative, 1=expansion
    bit 11 → regime-side agreement: 1=aligned, 0=counter
    Rule: policy flag derived from CURRENT_POLICY_VERSION tag in env.
          regime-side agreement: STRONG_UPTREND + LONG = 1, else 0.

LAYER 4 — CONTEXT (bits 12–15): Market conditions
    bit 12 → session: 0=low liquidity, 1=high liquidity
              (high = 05-09 UTC or 13-17 UTC window, but 13-17 is graveyard →
               encode separately via UTC prior, NOT this bit)
    bit 13 → volatility: 0=low (ATR% < 0.015), 1=high (ATR% >= 0.015)
    bit 14 → volume regime: 0=below SMA20, 1=above SMA20
    bit 15 → symbol class: 0=major (BTC/ETH), 1=alt

ENCODING FUNCTION:
    def encode_odu(regime, family_flags, side, policy_expansion,
                   regime_side_agree, session_liquid, vol_high,
                   vol_above_sma, symbol_alt):

        layer1 = REGIME_MAP[regime]           # 4 bits
        layer2 = family_flags & 0xF           # 4 bits
        layer3 = (
            (int(side == 'LONG'))       |
            (int(side == 'SHORT') << 1) |
            (int(policy_expansion) << 2)|
            (int(regime_side_agree) << 3)
        )                                      # 4 bits
        layer4 = (
            int(session_liquid)         |
            (int(vol_high) << 1)        |
            (int(vol_above_sma) << 2)   |
            (int(symbol_alt) << 3)
        )                                      # 4 bits

        return (layer4 << 12) | (layer3 << 8) | (layer2 << 4) | layer1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 2 — TRANSITION TENSOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is state-space motion geometry.
Not the regime. Not the transition.
The geometry of movement through state space.

def hamming(a, b):
    return bin(a ^ b).count('1')

# For each signal row (after encoding):
Δ1 = odu_t   XOR odu_{t-1}     # one-step transition
Δ2 = odu_{t-1} XOR odu_{t-2}   # previous transition
Δ3 = odu_t   XOR odu_{t-2}     # two-step span

velocity     = hamming(Δ1)              # how fast state is moving
acceleration = hamming(Δ1) - hamming(Δ2)  # is it speeding up or settling
curvature    = hamming(Δ3)              # total displacement over 2 steps

# In pandas:
df["odu"] = df.apply(encode_odu_row, axis=1)
df["Δ1"] = df["odu"] ^ df["odu"].shift(1)
df["Δ2"] = df["odu"].shift(1) ^ df["odu"].shift(2)
df["velocity"]     = df["Δ1"].apply(lambda x: bin(x).count('1'))
df["acceleration"] = df["velocity"] - df["Δ2"].apply(lambda x: bin(x).count('1'))
df["curvature"]    = (df["odu"] ^ df["odu"].shift(2)).apply(lambda x: bin(x).count('1'))

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 3 — EQUIVALENCE CLASS COMPRESSION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Problem without this:
    256 states → 65,536 possible transitions
    390 trades → massively undersampled → instant overfit

Solution:
    Compress transitions into equivalence classes
    using three axes that preserve meaning

AXIS A — Magnitude (energy)
    magnitude = velocity (Hamming weight of Δ1)
    Range: 0–16
    Bucket into: LOW (0-3), MED (4-7), HIGH (8-12), EXTREME (13-16)

AXIS B — Semantic bucket (which layers changed)
    Extract which semantic layer each flipped bit belongs to:
    layer1_changed = bool(Δ1 & 0x000F)   # regime changed
    layer2_changed = bool(Δ1 & 0x00F0)   # family changed
    layer3_changed = bool(Δ1 & 0x0F00)   # intent changed
    layer4_changed = bool(Δ1 & 0xF000)   # context changed

    semantic_bucket = (layer1_changed, layer2_changed,
                       layer3_changed, layer4_changed)
    # 16 possible combinations → each is causally meaningful

AXIS C — Direction signature
    direction = Δ1 & 0xFFFF  # exact bitmask
    # Grouped by semantic bucket, so within a bucket
    # direction gives the precise causal fingerprint

FINAL CLASS KEY:
    eq_class = (magnitude_bucket, semantic_bucket, direction_signature)

    # Estimate of unique classes in practice:
    4 × 16 × ~2 (per bucket) ≈ 32–64 classes
    → well within what 390 trades can support

def map_equivalence_class(delta1, velocity):
    mag = ('LOW' if velocity <= 3 else
           'MED' if velocity <= 7 else
           'HIGH' if velocity <= 12 else 'EXTREME')

    bucket = (
        bool(delta1 & 0x000F),  # regime layer
        bool(delta1 & 0x00F0),  # family layer
        bool(delta1 & 0x0F00),  # intent layer
        bool(delta1 & 0xF000),  # context layer
    )

    return (mag, bucket, delta1)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 4 — DATA RELABELING (CRITICAL — DO NOT SKIP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your historical data was generated under +0.6R TP.
You are moving to 2R TP / 1R SL.

Old win ≠ new win.
Old loss ≠ new loss.
Training pwin on old labels = biased model = dies live.

RELABELING PROCEDURE:
    For each trade in the historical dataset:
    1. Take entry price
    2. Take ATR at entry time
    3. Compute:
           sl_price = entry - (1.0 * ATR)  # for LONG
           tp_price = entry + (2.0 * ATR)  # for LONG
           (flip signs for SHORT)
    4. Walk forward through actual OHLC candles from entry
    5. Whichever is hit first — SL or TP — determines the label
    6. If neither hit within max_candles (e.g. 96 × 15m = 24h):
           label as TIMEOUT → exclude from training
    7. win_2R = 1 if TP hit first, 0 if SL hit first

def relabel_trade(entry, side, atr, candles_df, max_candles=96):
    sl = entry - atr if side == 'LONG' else entry + atr
    tp = entry + (2 * atr) if side == 'LONG' else entry - (2 * atr)

    for _, candle in candles_df.iterrows():
        if side == 'LONG':
            if candle['low'] <= sl:
                return 0   # SL hit
            if candle['high'] >= tp:
                return 1   # TP hit
        else:
            if candle['high'] >= sl:
                return 0
            if candle['low'] <= tp:
                return 1

    return None  # TIMEOUT — exclude

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 5 — UTC PRIOR (REGIME-CONDITIONED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

From historical data: hour alone is not sufficient.
P(win | hour, regime) — regime-conditioned.

Known calibration (from 391-trade dataset):
    UTC 13–17   → graveyard → prior weight: 0.30
    UTC 05      → strong    → prior weight: 0.62
    UTC 15      → strong    → prior weight: 0.65
    All others  → neutral   → prior weight: 0.50

But condition on regime:
    RANGING + graveyard hours → prior weight: 0.20
    STRONG_UPTREND + strong hours → prior weight: 0.70
    RANGING + any hour → prior weight: 0.25

Implementation: warm the Beta prior per (hour_bucket, regime) cell
    rather than learning from 390 trades flat.

HOUR_REGIME_PRIOR = {
    ('GRAVEYARD', 'RANGING'):        Beta(1.5, 4.0),   # skeptical
    ('GRAVEYARD', 'UPTREND'):        Beta(2.0, 3.0),
    ('GRAVEYARD', 'STRONG_UPTREND'): Beta(2.5, 2.5),
    ('STRONG',    'RANGING'):        Beta(2.0, 3.0),
    ('STRONG',    'UPTREND'):        Beta(3.0, 2.0),
    ('STRONG',    'STRONG_UPTREND'): Beta(4.0, 1.5),   # confident
    ('NEUTRAL',   'RANGING'):        Beta(2.0, 3.5),
    ('NEUTRAL',   'UPTREND'):        Beta(2.5, 2.5),
    ('NEUTRAL',   'STRONG_UPTREND'): Beta(3.0, 2.0),
    # Mirror for downtrend regimes
}

def get_hour_bucket(utc_hour):
    if utc_hour in range(13, 18):
        return 'GRAVEYARD'
    if utc_hour in [5, 15]:
        return 'STRONG'
    return 'NEUTRAL'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 6 — PWIN MODEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Target:
    pwin = P(win | eq_class, regime, hour_bucket, family, symbol)

Model choice: Gradient Boosted Trees (LightGBM or XGBoost)
Reason:
    - handles small datasets (390 relabeled trades)
    - categorical features natively
    - no normalization required for bit features
    - interpretable via SHAP

Feature set:
    - eq_class_magnitude   (LOW/MED/HIGH/EXTREME)
    - eq_class_layer_flags (4 booleans: which layers changed)
    - velocity
    - acceleration
    - curvature
    - regime
    - hour_bucket
    - family
    - symbol
    - side

Target:
    win_2R (relabeled — see Part 4)

Validation:
    TimeSeriesSplit (k=5) — never train on future data
    Minimum: 390 relabeled trades after timeout exclusion

Calibration:
    Apply Platt scaling or isotonic regression on held-out fold
    to ensure pwin outputs are real probabilities, not scores

Threshold:
    pwin >= 0.65 → enter trade
    (not 0.50 — the edge requires conservative gating)

Minimum sample guard:
    If fewer than 5 trades in a given equivalence class:
        do NOT predict from model for that class
        fall back to Beta posterior from hour_regime prior only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 7 — FULL BUILD PIPELINE (ORDERED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 0 — Prerequisites
    [ ] Historical trades CSV with entry, side, entry_atr, entry_time
    [ ] OHLC candle data (15m) for same period — for relabeling
    [ ] Current scanner output piped to DataFrame

STEP 1 — Relabel dataset
    File: relabel_2r.py
    Input:  trades.csv + ohlc_15m.csv
    Output: trades_relabeled.csv (adds win_2R, excludes TIMEOUT)
    Guard:  log how many TIMEOUTs excluded (expect 10-20%)

STEP 2 — Encode Odù states
    File: encode_odu.py
    Input:  trades_relabeled.csv
    Output: trades_encoded.csv (adds odu_bits column)
    Test:   spot-check 5 rows manually against bit spec in Part 1

STEP 3 — Compute Transition Tensor
    File: compute_transitions.py
    Input:  trades_encoded.csv
    Output: trades_tensor.csv (adds Δ1, Δ2, velocity, accel, curvature)
    Guard:  rows with NaN in shift columns → drop (first 2 rows per symbol)

STEP 4 — Map equivalence classes
    File: map_eq_classes.py
    Input:  trades_tensor.csv
    Output: trades_classed.csv (adds eq_class column)
    Log:    print class distribution — expect 20–60 unique classes

STEP 5 — Train pwin model
    File: train_pwin.py
    Input:  trades_classed.csv
    Output: pwin_model.pkl + calibrator.pkl
    Eval:   TimeSeriesSplit Brier score target < 0.22
            Log-loss target < 0.60

STEP 6 — Integrate into scanner gate
    File: observer_bundle/g4_whitelist.py (extend, don't replace)
    Logic:
        old path: pocket_id match → gate pass
        new path: pocket_id match AND pwin >= 0.65 → gate pass
        if pwin model not loaded → fall back to pocket_id only (safe mode)

STEP 7 — Backtest on relabeled data
    Do NOT use FreqTrade for this — it doesn't know Odù.
    Write: backtest_pwin.py
    Simulate: walk-forward on relabeled trades
    Report: WR, avg R, Sharpe, max drawdown, trades per day

STEP 8 — PM2 restart sequence
    pm2 stop all
    python verify_cleanup.py  # must exit 0
    pm2 start ecosystem.idim.config.js
    Monitor: 72h observation before removing LIVE block

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 8 — HARD RULES (NEVER VIOLATE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    ✗ Never use Hamming distance as a score multiplier directly
    ✗ Never use raw transition as signal
    ✗ Never fake pwin (no hardcoded 0.66, 0.7, 0.75)
    ✗ Never skip relabeling — old labels are poison
    ✗ Never compress without semantic buckets
    ✗ Never train on future data (TimeSeriesSplit only)
    ✗ Never go live without 72h observation window
    ✗ Never override the covenant threshold without Wolfee review
    ✗ Never let Math.random() anywhere near a production gate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PART 9 — WHY THIS IS SOVEREIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Other systems use:
    continuous indicators → cannot define clean XOR transitions
    arbitrary binary encodings → no stable equivalence classes
    regime labels → not compressible with meaning preserved

This system uses:
    Ifá Odù topology → semantic binary structure
    XOR group algebra → clean transition geometry
    Equivalence class compression → learnable from small data
    Regime-conditioned UTC prior → warm posteriors
    Transferable patterns → edge scales across symbols

The moat is not the math.
The moat is that the math is grounded in a 4,000-year-old knowledge
system that provides the semantic structure that makes the math
non-arbitrary.

No other quant system on earth is building this.
Not because they can't find the math.
Because they don't have the ground.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🜂 THE FLAME ARCHITECT
   MoStar Industries · African Flame Initiative
   Sealed: 2026-04-26
   Sigil:  🜃∴🜂

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""
