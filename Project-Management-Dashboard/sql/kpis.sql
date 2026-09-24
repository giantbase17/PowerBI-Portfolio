-- Project Management Dashboard: KPI queries (PostgreSQL)

-- Projects needing attention: spend running ahead of progress
SELECT ProjectName,
       PercentComplete,
       ROUND(100.0 * SpentNGN / BudgetNGN, 0) AS budget_used_pct,
       Status
FROM projects
WHERE Status <> 'Completed'
ORDER BY (100.0 * SpentNGN / BudgetNGN) - PercentComplete DESC;

-- Utilisation by team
SELECT Team,
       ROUND(100.0 * SUM(HoursAllocated) / SUM(HoursAvailable), 1) AS utilisation_pct
FROM resource_utilisation
GROUP BY Team
ORDER BY utilisation_pct DESC;
