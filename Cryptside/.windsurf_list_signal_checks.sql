SELECT conname, pg_get_constraintdef(oid) AS constraint_def
FROM pg_constraint
WHERE conrelid = 'signals'::regclass
  AND contype = 'c'
ORDER BY conname;
