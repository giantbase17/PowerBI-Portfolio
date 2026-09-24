-- Network Infrastructure Dashboard: table definitions (PostgreSQL)

CREATE TABLE sites (
  SiteID        VARCHAR(3) PRIMARY KEY,
  Site          VARCHAR(60) NOT NULL,
  PrimaryLink   VARCHAR(15) NOT NULL,
  CapacityMbps  INT NOT NULL
);

CREATE TABLE devices (
  DeviceID    VARCHAR(10) PRIMARY KEY,
  SiteID      VARCHAR(3) NOT NULL REFERENCES sites (SiteID),
  DeviceType  VARCHAR(20) NOT NULL,
  Vendor      VARCHAR(20) NOT NULL,
  Status      VARCHAR(10) NOT NULL
);

CREATE TABLE daily_site_metrics (
  Date                 DATE NOT NULL,
  SiteID               VARCHAR(3) NOT NULL REFERENCES sites (SiteID),
  UptimeMinutes        INT NOT NULL,
  DowntimeMinutes      INT NOT NULL,
  AvgUtilisationMbps   NUMERIC(8,1) NOT NULL,
  PeakUtilisationMbps  NUMERIC(8,1) NOT NULL,
  PRIMARY KEY (Date, SiteID)
);

CREATE TABLE incidents (
  IncidentID         VARCHAR(10) PRIMARY KEY,
  SiteID             VARCHAR(3) NOT NULL REFERENCES sites (SiteID),
  Opened             TIMESTAMP NOT NULL,
  Resolved           TIMESTAMP NOT NULL,
  Severity           VARCHAR(2) NOT NULL,
  Category           VARCHAR(20) NOT NULL,
  ResolutionMinutes  INT NOT NULL
);
