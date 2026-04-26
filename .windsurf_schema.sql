\d signals
\d training_candidates

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('signals', 'training_candidates')
ORDER BY table_name, ordinal_position;
