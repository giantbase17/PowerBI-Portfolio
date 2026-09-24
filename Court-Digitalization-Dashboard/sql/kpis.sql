-- Court Digitalization Dashboard: KPI queries (PostgreSQL)

-- Monthly virtual & hybrid share by court
SELECT c.Court,
       DATE_TRUNC('month', h.Date) AS month,
       ROUND(100.0 * AVG(CASE WHEN h.Mode <> 'In-person' THEN 1 ELSE 0 END), 1) AS virtual_share_pct
FROM hearings h
JOIN courts c USING (CourtID)
GROUP BY c.Court, 2
ORDER BY c.Court, 2;

-- Adjournment rate by hearing mode
SELECT Mode,
       COUNT(*) AS hearings,
       ROUND(100.0 * AVG(CASE WHEN Adjourned = 'Y' THEN 1 ELSE 0 END), 1) AS adjournment_pct
FROM hearings
GROUP BY Mode;
