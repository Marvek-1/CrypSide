CREATE DATABASE idim_ikang;

\connect idim_ikang;

CREATE TABLE IF NOT EXISTS signals (
    id BIGSERIAL PRIMARY KEY,
    signal_id UUID NOT NULL UNIQUE,
    pair TEXT NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    entry NUMERIC NOT NULL,
    stop_loss NUMERIC NOT NULL,
    take_profit NUMERIC NOT NULL,
    score NUMERIC NOT NULL,
    regime TEXT NOT NULL,
    reason_trace JSONB NOT NULL,
    logic_version TEXT NOT NULL,
    config_version TEXT NOT NULL,
    outcome TEXT NULL CHECK (outcome IN ('WIN', 'LOSS', 'EXPIRED', 'TP1_ONLY', 'HIT_TP1', 'TP2_WIN')),
    r_multiple NUMERIC NULL,
    source TEXT NOT NULL DEFAULT 'observer_live',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_pair_ts ON signals(pair, ts DESC);
CREATE INDEX IF NOT EXISTS idx_signals_outcome_null ON signals(outcome) WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS system_logs (
    id BIGSERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL,
    component TEXT NOT NULL,
    event TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_system_logs_ts ON system_logs(ts DESC);

CREATE TABLE IF NOT EXISTS execution_intents (
    id BIGSERIAL PRIMARY KEY,
    intent_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL,
    asset TEXT NOT NULL,
    side TEXT NOT NULL,
    entry NUMERIC,
    stop_loss NUMERIC,
    take_profit NUMERIC[],
    status TEXT NOT NULL,
    execution_mode TEXT NOT NULL DEFAULT 'paper',
    live_execution BOOLEAN NOT NULL DEFAULT false,
    requires_manual BOOLEAN NOT NULL DEFAULT true,
    mo_lingua_packet TEXT,
    risk_class TEXT,
    max_risk_pct NUMERIC DEFAULT 0.5,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at TIMESTAMPTZ,
    consumed_by TEXT,
    qseal TEXT DEFAULT '🜃∴🜂',
    research_only BOOLEAN DEFAULT FALSE,
    confidence_gate_eligible BOOLEAN DEFAULT TRUE,
    research_reason TEXT,
    reconstructed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_execution_intents_signal_id ON execution_intents(signal_id);
CREATE INDEX IF NOT EXISTS idx_execution_intents_status ON execution_intents(status);

CREATE TABLE IF NOT EXISTS semantic_reviews (
    id BIGSERIAL PRIMARY KEY,
    signal_id UUID NOT NULL,
    intent_id UUID,
    status TEXT NOT NULL,
    reason TEXT,
    mo_lingua_packet TEXT,
    regime_version TEXT,
    score NUMERIC,
    risk_class TEXT,
    execution_mode TEXT,
    live_execution BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reconstructed BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_semantic_reviews_signal_id ON semantic_reviews(signal_id);

CREATE TABLE IF NOT EXISTS paper_orders (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    intent_id UUID NOT NULL,
    signal_id UUID NOT NULL,
    asset TEXT NOT NULL,
    side TEXT NOT NULL,
    entry NUMERIC,
    stop_loss NUMERIC,
    take_profit NUMERIC[],
    quantity NUMERIC,
    risk_amount NUMERIC,
    filled_at NUMERIC,
    fill_time TIMESTAMPTZ,
    status TEXT NOT NULL,
    fill_mode TEXT,
    sim_slippage_pct NUMERIC,
    outcome TEXT DEFAULT 'OPEN',
    exit_price NUMERIC,
    r_multiple NUMERIC,
    resolved_at TIMESTAMPTZ,
    regime_version TEXT DEFAULT 'v2_adx_ema_rsi',
    research_only BOOLEAN DEFAULT FALSE,
    confidence_gate_eligible BOOLEAN DEFAULT FALSE,
    research_reason TEXT,
    reconstructed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_outcome ON paper_orders(outcome);
CREATE INDEX IF NOT EXISTS idx_paper_orders_regime ON paper_orders(regime_version);
