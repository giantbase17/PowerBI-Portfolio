-- Court Digitalization Dashboard: table definitions (PostgreSQL)

CREATE TABLE courts (
  CourtID             VARCHAR(4) PRIMARY KEY,
  Court               VARCHAR(60) NOT NULL,
  Courtrooms          INT NOT NULL,
  DigitalRoomsGoLive  DATE NOT NULL
);

CREATE TABLE hearings (
  HearingID        VARCHAR(10) PRIMARY KEY,
  Date             DATE NOT NULL,
  CourtID          VARCHAR(4) NOT NULL REFERENCES courts (CourtID),
  CaseType         VARCHAR(15) NOT NULL,
  Mode             VARCHAR(10) NOT NULL,
  DurationMinutes  INT NOT NULL,
  Adjourned        CHAR(1) NOT NULL,
  TechIssue        CHAR(1) NOT NULL
);

CREATE TABLE tech_issues (
  IssueID      VARCHAR(10) PRIMARY KEY,
  HearingID    VARCHAR(10) NOT NULL REFERENCES hearings (HearingID),
  Date         DATE NOT NULL,
  CourtID      VARCHAR(4) NOT NULL REFERENCES courts (CourtID),
  Category     VARCHAR(20) NOT NULL,
  MinutesLost  INT NOT NULL
);
