ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_outcome_check;
ALTER TABLE signals ADD CONSTRAINT signals_outcome_check CHECK (
    outcome IN (
        'WIN',
        'LOSS',
        'EXPIRED',
        'PARTIAL_WIN',
        'TP1_ONLY',
        'HIT_TP1',
        'TP2_WIN',
        'ARCHIVED_V1',
        'LIVE_WIN',
        'LIVE_LOSS',
        'LIVE_PARTIAL'
    )
);
