SELECT pg_get_constraintdef(oid) AS outcome_constraint
FROM pg_constraint
WHERE conrelid = 'signals'::regclass
  AND conname = 'signals_outcome_check';
