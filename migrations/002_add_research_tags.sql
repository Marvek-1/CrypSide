-- Phase 2ac: Research Tag Persistence Migration
-- Purpose: Add columns to track paper-only exploration signals separately from validated signals
-- to prevent contamination of Confidence Gate metrics

-- Add research tag columns to signals table
-- Note: research_only column already exists, adding confidence_gate_eligible and research_reason
ALTER TABLE signals
ADD COLUMN IF NOT EXISTS confidence_gate_eligible BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS research_reason TEXT;

-- Add research tag columns to paper_orders table
ALTER TABLE paper_orders
ADD COLUMN IF NOT EXISTS research_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confidence_gate_eligible BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS research_reason TEXT;

-- Update existing research_only signals to have confidence_gate_eligible = false
UPDATE signals
SET confidence_gate_eligible = false,
    research_reason = COALESCE(research_reason, 'legacy_research_flag')
WHERE research_only = true;

-- Add comment documentation
COMMENT ON COLUMN signals.confidence_gate_eligible IS 'Whether signal is eligible for Confidence Gate validation. False for paper-only exploration signals.';
COMMENT ON COLUMN signals.research_reason IS 'Reason why signal was marked as research-only (e.g., wolfram_high_score_exploration)';
COMMENT ON COLUMN paper_orders.research_only IS 'Whether order originated from a research-only signal';
COMMENT ON COLUMN paper_orders.confidence_gate_eligible IS 'Whether order is eligible for Confidence Gate validation';
COMMENT ON COLUMN paper_orders.research_reason IS 'Reason why order was marked as research-only';
