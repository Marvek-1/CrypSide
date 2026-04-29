SELECT
  signal_family,
  COUNT(*) FILTER (WHERE outcome IN ('WIN','LOSS')) AS resolved,
  COUNT(*) FILTER (WHERE outcome='WIN') AS wins,
  COUNT(*) FILTER (WHERE outcome='LOSS') AS losses,
  ROUND(
    COUNT(*) FILTER (WHERE outcome='WIN') * 100.0 /
    NULLIF(COUNT(*) FILTER (WHERE outcome IN ('WIN','LOSS')),0), 1
  ) AS win_rate,
  ROUND(AVG(score) FILTER (WHERE outcome='WIN')::numeric, 1) AS avg_win_score,
  ROUND(AVG(r_multiple)::numeric, 3) AS avg_r,
  ROUND(
    COALESCE(SUM(CASE WHEN outcome='WIN' THEN ABS(r_multiple) ELSE 0 END),0) /
    NULLIF(COALESCE(SUM(CASE WHEN outcome='LOSS' THEN ABS(r_multiple) ELSE 0 END),0),0),
    2
  ) AS profit_factor
FROM signals
WHERE created_at > '2026-04-29 22:00:00'
  AND outcome IN ('WIN','LOSS')
GROUP BY signal_family
ORDER BY resolved DESC;
