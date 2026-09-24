-- Project Management Dashboard: table definitions (PostgreSQL)

CREATE TABLE projects (
  ProjectID        VARCHAR(8) PRIMARY KEY,
  ProjectName      VARCHAR(80) NOT NULL,
  Sector           VARCHAR(20) NOT NULL,
  ProjectManager   VARCHAR(10) NOT NULL,
  StartDate        DATE NOT NULL,
  PlannedEndDate   DATE NOT NULL,
  BudgetNGN        BIGINT NOT NULL,
  SpentNGN         BIGINT NOT NULL,
  PercentComplete  INT NOT NULL,
  Status           VARCHAR(12) NOT NULL
);

CREATE TABLE milestones (
  ProjectID    VARCHAR(8) NOT NULL REFERENCES projects (ProjectID),
  Milestone    VARCHAR(40) NOT NULL,
  PlannedDate  DATE NOT NULL,
  ActualDate   DATE,
  Status       VARCHAR(16) NOT NULL,
  PRIMARY KEY (ProjectID, Milestone)
);

CREATE TABLE resource_utilisation (
  WeekStarting    DATE NOT NULL,
  Engineer        VARCHAR(15) NOT NULL,
  Team            VARCHAR(25) NOT NULL,
  HoursAvailable  INT NOT NULL,
  HoursAllocated  INT NOT NULL,
  PRIMARY KEY (WeekStarting, Engineer)
);
