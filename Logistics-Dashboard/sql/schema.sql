-- Logistics Operations Dashboard: table definitions (PostgreSQL)

CREATE TABLE routes (
  RouteID      VARCHAR(5) PRIMARY KEY,
  Origin       VARCHAR(40) NOT NULL,
  Destination  VARCHAR(40) NOT NULL,
  DistanceKm   INT NOT NULL,
  TargetDays   INT NOT NULL
);

CREATE TABLE shipments (
  ShipmentID      VARCHAR(20) PRIMARY KEY,
  ShipDate        DATE NOT NULL,
  DeliveredDate   DATE NOT NULL,
  RouteID         VARCHAR(5) NOT NULL REFERENCES routes (RouteID),
  Carrier         VARCHAR(30) NOT NULL,
  WeightKg        INT NOT NULL,
  PromisedDays    INT NOT NULL,
  ActualDays      INT NOT NULL,
  OnTime          CHAR(1) NOT NULL,
  FreightCostNGN  BIGINT NOT NULL
);
