-- Business Performance Dashboard: KPI queries (PostgreSQL)

-- P&L by line: actual, budget and variance for the year
SELECT a.AccountType,
       a.Category,
       SUM(a.ActualNGN)                                              AS actual,
       SUM(b.BudgetNGN)                                              AS budget,
       ROUND(100.0 * (SUM(a.ActualNGN) - SUM(b.BudgetNGN)) / SUM(b.BudgetNGN), 1) AS variance_pct
FROM actuals a
JOIN budget b USING (Month, Category)
GROUP BY a.AccountType, a.Category
ORDER BY a.AccountType DESC, actual DESC;

-- Monthly net profit, actual vs budget
SELECT Month,
       SUM(CASE WHEN AccountType = 'Revenue' THEN ActualNGN ELSE -ActualNGN END) AS net_profit_actual
FROM actuals
GROUP BY Month
ORDER BY Month;
