SELECT outcome, count(*) as n
FROM signals
WHERE ts > now() - interval '7 days'
GROUP BY outcome
ORDER BY n DESC;

SELECT outcome, max(ts) as last_resolved
FROM signals
WHERE outcome IS NOT NULL
GROUP BY outcome;
