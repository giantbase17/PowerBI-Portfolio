// Row shapes for every CSV in the repository. The generator writes these and the
// dashboard builder reads them back, so both sides are checked against one definition.

export type YesNo = "Y" | "N";
export type Cell = string | number;

// ---------- Logistics ----------
export interface Route {
  RouteID: string;
  Origin: string;
  Destination: string;
  DistanceKm: number;
  TargetDays: number;
}
export interface Shipment {
  ShipmentID: string;
  ShipDate: string;
  DeliveredDate: string;
  RouteID: string;
  Carrier: string;
  WeightKg: number;
  PromisedDays: number;
  ActualDays: number;
  OnTime: YesNo;
  FreightCostNGN: number;
}

// ---------- Sales ----------
export interface Product {
  ProductID: string;
  Product: string;
  Category: string;
  UnitCostNGN: number;
  ListPriceNGN: number;
}
export interface Customer {
  CustomerID: string;
  Segment: string;
  Region: string;
}
export interface Sale {
  OrderID: string;
  OrderDate: string;
  CustomerID: string;
  ProductID: string;
  Quantity: number;
  UnitPriceNGN: number;
  Discount: number;
  RevenueNGN: number;
  COGSNGN: number;
  ProfitNGN: number;
}

// ---------- Business performance ----------
export type AccountType = "Revenue" | "Expense";
export interface Actual {
  Month: string;
  AccountType: AccountType;
  Category: string;
  ActualNGN: number;
}
export interface Budget {
  Month: string;
  AccountType: AccountType;
  Category: string;
  BudgetNGN: number;
}

// ---------- Project management ----------
export type ProjectStatus = "On Track" | "Watch" | "At Risk" | "Completed";
export type MilestoneStatus = "Completed" | "Completed Late" | "Overdue" | "Upcoming";
export interface Project {
  ProjectID: string;
  ProjectName: string;
  Sector: string;
  ProjectManager: string;
  StartDate: string;
  PlannedEndDate: string;
  BudgetNGN: number;
  SpentNGN: number;
  PercentComplete: number;
  Status: ProjectStatus;
}
export interface Milestone {
  ProjectID: string;
  Milestone: string;
  PlannedDate: string;
  ActualDate: string; // blank until achieved
  Status: MilestoneStatus;
}
export interface Utilisation {
  WeekStarting: string;
  Engineer: string;
  Team: string;
  HoursAvailable: number;
  HoursAllocated: number;
}

// ---------- Network infrastructure ----------
export type Severity = "P1" | "P2" | "P3";
export type DeviceStatus = "Healthy" | "Warning" | "Critical";
export interface Site {
  SiteID: string;
  Site: string;
  PrimaryLink: string;
  CapacityMbps: number;
}
export interface Device {
  DeviceID: string;
  SiteID: string;
  DeviceType: string;
  Vendor: string;
  Status: DeviceStatus;
}
export interface DailySiteMetric {
  Date: string;
  SiteID: string;
  UptimeMinutes: number;
  DowntimeMinutes: number;
  AvgUtilisationMbps: number;
  PeakUtilisationMbps: number;
}
export interface Incident {
  IncidentID: string;
  SiteID: string;
  Opened: string;
  Resolved: string;
  Severity: Severity;
  Category: string;
  ResolutionMinutes: number;
}

// ---------- Court digitalization ----------
export type HearingMode = "In-person" | "Virtual" | "Hybrid";
export interface Court {
  CourtID: string;
  Court: string;
  Courtrooms: number;
  DigitalRoomsGoLive: string;
}
export interface Hearing {
  HearingID: string;
  Date: string;
  CourtID: string;
  CaseType: string;
  Mode: HearingMode;
  DurationMinutes: number;
  Adjourned: YesNo;
  TechIssue: YesNo;
}
export interface TechIssue {
  IssueID: string;
  HearingID: string;
  Date: string;
  CourtID: string;
  Category: string;
  MinutesLost: number;
}
