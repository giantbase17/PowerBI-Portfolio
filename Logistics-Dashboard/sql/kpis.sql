-- Logistics Operations Dashboard: KPI queries (PostgreSQL)

-- Monthly volume and on-time rate
SELECT DATE_TRUNC('month', ShipDate)                         AS month,
       COUNT(*)                                              AS shipments,
       ROUND(100.0 * AVG(CASE WHEN OnTime = 'Y' THEN 1 ELSE 0 END), 1) AS on_time_pct
FROM shipments
GROUP BY 1
ORDER BY 1;

-- Route scorecard, worst on-time rate first
SELECT r.Origin || ' → ' || r.Destination                     AS route,
       COUNT(*)                                              AS shipments,
       ROUND(100.0 * AVG(CASE WHEN s.OnTime = 'Y' THEN 1 ELSE 0 END), 1) AS on_time_pct,
       ROUND(SUM(s.FreightCostNGN)::numeric / SUM(s.WeightKg), 0) AS cost_per_kg
FROM shipments s
JOIN routes r USING (RouteID)
GROUP BY 1
ORDER BY on_time_pct;
