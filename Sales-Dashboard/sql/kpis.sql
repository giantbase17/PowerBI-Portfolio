-- Sales Performance Dashboard: KPI queries (PostgreSQL)

-- Revenue, profit and margin by category
SELECT p.Category,
       SUM(s.RevenueNGN)                                        AS revenue,
       SUM(s.ProfitNGN)                                         AS gross_profit,
       ROUND(100.0 * SUM(s.ProfitNGN) / SUM(s.RevenueNGN), 1)   AS margin_pct
FROM sales s
JOIN products p USING (ProductID)
GROUP BY p.Category
ORDER BY revenue DESC;

-- Segment view
SELECT c.Segment,
       SUM(s.RevenueNGN)            AS revenue,
       COUNT(*)                     AS orders,
       COUNT(DISTINCT s.CustomerID) AS customers
FROM sales s
JOIN customers c USING (CustomerID)
GROUP BY c.Segment
ORDER BY revenue DESC;
