-- Business Performance Dashboard: table definitions (PostgreSQL)

CREATE TABLE actuals (
  Month        DATE NOT NULL,
  AccountType  VARCHAR(10) NOT NULL,
  Category     VARCHAR(40) NOT NULL,
  ActualNGN    BIGINT NOT NULL,
  PRIMARY KEY (Month, Category)
);

CREATE TABLE budget (
  Month        DATE NOT NULL,
  AccountType  VARCHAR(10) NOT NULL,
  Category     VARCHAR(40) NOT NULL,
  BudgetNGN    BIGINT NOT NULL,
  PRIMARY KEY (Month, Category)
);
