-- Phase 2af: Add research tag columns to execution_intents table
-- This allows research signals to be tracked through the semantic review pipeline

ALTER TABLE execution_intents
ADD COLUMN IF NOT EXISTS research_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS confidence_gate_eligible BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS research_reason TEXT;

COMMENT ON COLUMN execution_intents.research_only IS 'Indicates if the execution intent is for research purposes only';
COMMENT ON COLUMN execution_intents.confidence_gate_eligible IS 'Indicates if the execution intent is eligible for the Confidence Gate (false if research-only)';
COMMENT ON COLUMN execution_intents.research_reason IS 'Reason why the execution intent was marked as research-only';
