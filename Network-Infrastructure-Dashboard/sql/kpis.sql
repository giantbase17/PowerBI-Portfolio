-- Network Infrastructure Dashboard: KPI queries (PostgreSQL)

-- Availability and SLA status by site
SELECT s.Site,
       s.PrimaryLink,
       ROUND(100.0 * SUM(m.UptimeMinutes) / (COUNT(*) * 1440), 3) AS availability_pct,
       CASE WHEN SUM(m.UptimeMinutes) >= 0.995 * COUNT(*) * 1440 THEN 'Met' ELSE 'Missed' END AS sla
FROM daily_site_metrics m
JOIN sites s USING (SiteID)
GROUP BY s.Site, s.PrimaryLink
ORDER BY availability_pct;

-- Incidents and MTTR by cause
SELECT Category,
       COUNT(*)                          AS incidents,
       ROUND(AVG(ResolutionMinutes), 0)  AS mttr_minutes
FROM incidents
GROUP BY Category
ORDER BY incidents DESC;
