-- Sales Performance Dashboard: table definitions (PostgreSQL)

CREATE TABLE products (
  ProductID     VARCHAR(5) PRIMARY KEY,
  Product       VARCHAR(60) NOT NULL,
  Category      VARCHAR(20) NOT NULL,
  UnitCostNGN   INT NOT NULL,
  ListPriceNGN  INT NOT NULL
);

CREATE TABLE customers (
  CustomerID  VARCHAR(6) PRIMARY KEY,
  Segment     VARCHAR(20) NOT NULL,
  Region      VARCHAR(20) NOT NULL
);

CREATE TABLE sales (
  OrderID       VARCHAR(10) PRIMARY KEY,
  OrderDate     DATE NOT NULL,
  CustomerID    VARCHAR(6) NOT NULL REFERENCES customers (CustomerID),
  ProductID     VARCHAR(5) NOT NULL REFERENCES products (ProductID),
  Quantity      INT NOT NULL,
  UnitPriceNGN  INT NOT NULL,
  Discount      NUMERIC(4,2) NOT NULL,
  RevenueNGN    BIGINT NOT NULL,
  COGSNGN       BIGINT NOT NULL,
  ProfitNGN     BIGINT NOT NULL
);
