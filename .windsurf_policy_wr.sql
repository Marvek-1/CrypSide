SELECT policy_version, count(*) as n,
  count(*) FILTER (WHERE outcome='WIN') as wins,
  round(100.0 * count(*) FILTER (WHERE outcome='WIN') / count(*), 1) as wr_pct,
  round(avg(r_multiple)::numeric, 3) as avg_r
FROM signals
WHERE outcome IS NOT NULL
GROUP BY policy_version
ORDER BY min(ts) ASC;
