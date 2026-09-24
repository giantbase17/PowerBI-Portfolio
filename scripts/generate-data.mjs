// Generates the sample datasets for every dashboard in this repository.
//
//   node scripts/generate-data.mjs
//
// All data is synthetic and seeded, so every run produces identical files.
// Site, court and people names are anonymised on purpose: the figures are
// realistic in shape but do not describe any real organisation.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- helpers ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const make = (seed) => {
  const r = rng(seed);
  const api = {
    r,
    int: (min, max) => Math.floor(r() * (max - min + 1)) + min,
    pick: (arr) => arr[Math.floor(r() * arr.length)],
    weighted: (items) => {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let x = r() * total;
      for (const [v, w] of items) if ((x -= w) <= 0) return v;
      return items[items.length - 1][0];
    },
    normal: (mean, sd) => {
      const u = 1 - r();
      const v = r();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return api;
};
const pad = (n, w = 4) => String(n).padStart(w, "0");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const YEAR = 2025;
const days = (() => {
  const out = [];
  for (let d = new Date(Date.UTC(YEAR, 0, 1)); d.getUTCFullYear() === YEAR; d = addDays(d, 1)) out.push(d);
  return out;
})();
// Mild seasonality: quieter January, busier Q4.
const season = (d) => 0.85 + 0.3 * (d.getUTCMonth() / 11) + 0.05 * Math.sin((d.getUTCMonth() / 12) * Math.PI * 2);
const weekday = (d) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;

function csv(file, rows) {
  const path = join(root, file);
  mkdirSync(dirname(path), { recursive: true });
  const cols = Object.keys(rows[0]);
  const esc = (v) => (typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(path, [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n");
  console.log(`${file}  ${rows.length} rows`);
}

// ---------- 1. Logistics ----------
{
  const g = make(101);
  const cities = { Lagos: [6.52, 3.38], Abuja: [9.06, 7.49], "Port Harcourt": [4.82, 7.03], Enugu: [6.46, 7.55], Kano: [12.0, 8.52], Ibadan: [7.38, 3.94], Owerri: [5.48, 7.03] };
  const km = (a, b) => {
    const [x1, y1] = cities[a];
    const [x2, y2] = cities[b];
    return Math.round(Math.hypot(x1 - x2, y1 - y2) * 111 * 1.25);
  };
  const routes = [
    ["Lagos", "Abuja"], ["Lagos", "Port Harcourt"], ["Lagos", "Ibadan"], ["Lagos", "Enugu"], ["Abuja", "Kano"],
    ["Port Harcourt", "Owerri"], ["Enugu", "Port Harcourt"], ["Abuja", "Enugu"], ["Lagos", "Kano"], ["Ibadan", "Abuja"],
  ].map(([o, d], i) => ({ RouteID: `R${pad(i + 1, 2)}`, Origin: o, Destination: d, DistanceKm: km(o, d), TargetDays: Math.max(1, Math.ceil(km(o, d) / 450)) }));
  // Route reliability differs so the route comparison has a story.
  const delayBias = { R01: 0.14, R02: 0.2, R03: 0.05, R04: 0.12, R05: 0.1, R06: 0.06, R07: 0.16, R08: 0.11, R09: 0.28, R10: 0.09 };
  const carriers = [["Fleet A", 5], ["Fleet B", 3], ["Partner Haulage", 2]];
  const shipments = [];
  let id = 1;
  for (const d of days) {
    if (!weekday(d) && g.r() < 0.6) continue;
    const n = Math.round(g.normal(11 * season(d), 2.5));
    for (let i = 0; i < n; i++) {
      const route = g.weighted(routes.map((r) => [r, r.DistanceKm < 200 ? 4 : r.DistanceKm > 700 ? 1.5 : 2.5]));
      const carrier = g.weighted(carriers);
      const late = g.r() < delayBias[route.RouteID] + (carrier === "Partner Haulage" ? 0.06 : 0);
      const actual = route.TargetDays + (late ? g.int(1, 3) : g.r() < 0.15 ? -0 : 0);
      const weight = Math.round(Math.max(50, g.normal(1800, 900)));
      shipments.push({
        ShipmentID: `SHP-${YEAR}-${pad(id++, 5)}`,
        ShipDate: iso(d),
        DeliveredDate: iso(addDays(d, actual)),
        RouteID: route.RouteID,
        Carrier: carrier,
        WeightKg: weight,
        PromisedDays: route.TargetDays,
        ActualDays: actual,
        OnTime: late ? "N" : "Y",
        FreightCostNGN: Math.round(route.DistanceKm * (weight / 1000) * g.normal(620, 40) + 15000),
      });
    }
  }
  csv("Logistics-Dashboard/dataset/routes.csv", routes);
  csv("Logistics-Dashboard/dataset/shipments.csv", shipments);
}

// ---------- 2. Sales ----------
{
  const g = make(202);
  const products = [
    ["Fibre Router", "Networking", 42000, 65000], ["Wi-Fi Access Point", "Networking", 38000, 59000], ["24-Port Switch", "Networking", 95000, 140000],
    ["IP Camera (4MP)", "Security", 28000, 47000], ["NVR 16-Channel", "Security", 120000, 180000], ["Access Control Kit", "Security", 85000, 130000],
    ["Solar Panel 450W", "Power", 70000, 98000], ["Inverter 5kVA", "Power", 310000, 420000], ["Lithium Battery 5kWh", "Power", 520000, 690000],
    ["Cat6 Cable (305m)", "Cabling", 48000, 72000], ["Patch Panel 24-Port", "Cabling", 16000, 27000], ["Server Rack 42U", "Cabling", 230000, 320000],
  ].map(([Product, Category, UnitCostNGN, ListPriceNGN], i) => ({ ProductID: `P${pad(i + 1, 3)}`, Product, Category, UnitCostNGN, ListPriceNGN }));
  const regions = [["South West", 5], ["South South", 3], ["South East", 3], ["North Central", 2.5], ["North West", 1.5]];
  const segments = [["Enterprise", 2], ["SME", 5], ["Government", 1.5], ["Residential", 3]];
  const customers = Array.from({ length: 420 }, (_, i) => ({ CustomerID: `C${pad(i + 1)}`, Segment: g.weighted(segments), Region: g.weighted(regions) }));
  const orders = [];
  let id = 1;
  for (const d of days) {
    const n = Math.round(g.normal((weekday(d) ? 13 : 5) * season(d), 3));
    for (let i = 0; i < n; i++) {
      const c = g.pick(customers);
      const p = g.weighted(products.map((p) => [p, p.ListPriceNGN > 300000 ? 1 : p.ListPriceNGN > 100000 ? 2 : 4]));
      const qty = c.Segment === "Residential" ? g.int(1, 2) : c.Segment === "SME" ? g.int(1, 5) : g.int(2, 14);
      const discount = c.Segment === "Government" || c.Segment === "Enterprise" ? g.pick([0.05, 0.08, 0.1, 0.12]) : g.pick([0, 0, 0.03, 0.05]);
      const revenue = Math.round(qty * p.ListPriceNGN * (1 - discount));
      const cogs = qty * p.UnitCostNGN;
      orders.push({ OrderID: `SO-${pad(id++, 5)}`, OrderDate: iso(d), CustomerID: c.CustomerID, ProductID: p.ProductID, Quantity: qty, UnitPriceNGN: p.ListPriceNGN, Discount: discount, RevenueNGN: revenue, COGSNGN: cogs, ProfitNGN: revenue - cogs });
    }
  }
  csv("Sales-Dashboard/dataset/products.csv", products);
  csv("Sales-Dashboard/dataset/customers.csv", customers);
  csv("Sales-Dashboard/dataset/sales.csv", orders);
}

// ---------- 3. Business performance ----------
{
  const g = make(303);
  const lines = [
    ["Revenue", "Installations", 38_000_000], ["Revenue", "Managed Services", 16_000_000], ["Revenue", "Equipment Sales", 22_000_000],
    ["Expense", "Salaries", 21_000_000], ["Expense", "Equipment & Materials", 24_000_000], ["Expense", "Logistics & Fuel", 5_500_000],
    ["Expense", "Rent & Utilities", 3_200_000], ["Expense", "Marketing", 1_800_000], ["Expense", "Other Overheads", 2_400_000],
  ];
  const actuals = [];
  const budget = [];
  for (let m = 0; m < 12; m++) {
    const month = `${YEAR}-${pad(m + 1, 2)}-01`;
    const growth = 1 + m * 0.018;
    for (const [type, category, base] of lines) {
      const plan = Math.round(base * (type === "Revenue" ? growth : 1 + m * 0.01));
      const drift = type === "Revenue" ? g.normal(m < 4 ? 0.95 : 1.04, 0.05) : g.normal(1.01, 0.04);
      budget.push({ Month: month, AccountType: type, Category: category, BudgetNGN: plan });
      actuals.push({ Month: month, AccountType: type, Category: category, ActualNGN: Math.round(plan * drift) });
    }
  }
  csv("Business-Performance-Dashboard/dataset/actuals.csv", actuals);
  csv("Business-Performance-Dashboard/dataset/budget.csv", budget);
}

// ---------- 4. Project management ----------
{
  const g = make(404);
  const names = [
    ["Court Network Upgrade – Site A", "Judiciary"], ["Virtual Hearing Rooms – Site B", "Judiciary"], ["Ministry LAN Refresh", "Government"],
    ["Retail Wi-Fi Rollout – 6 Stores", "Retail"], ["CCTV Expansion – Warehouse", "Commercial"], ["Starlink Backhaul – Rural Sites", "Telecom"],
    ["Structured Cabling – Office Tower", "Commercial"], ["Solar Backup – Branch Offices", "Commercial"], ["Data Centre Rack Migration", "Enterprise"],
    ["Access Control – Head Office", "Enterprise"], ["Court Records Digitisation Support", "Judiciary"], ["Campus Fibre Link", "Education"],
  ];
  const pms = ["PM 01", "PM 02", "PM 03"];
  const projects = [];
  const milestones = [];
  const stages = ["Site Survey", "Design Approved", "Procurement", "Installation", "Testing & Commissioning", "Handover & Training"];
  names.forEach(([name, sector], i) => {
    const start = addDays(new Date(Date.UTC(YEAR, 0, 6)), i < 5 ? g.int(0, 150) : g.int(215, 330));
    const durationDays = g.int(60, 170);
    const end = addDays(start, durationDays);
    const budget = g.int(8, 60) * 1_000_000;
    const asOf = new Date(Date.UTC(YEAR, 11, 31));
    const elapsed = Math.min(1, Math.max(0, (asOf - start) / (end - start)));
    // Fixed risk profile per project so the portfolio has a realistic mix of states.
    const risk = [0.3, 0.7, 0.9, 0.2, 0.4, 0.85, 0.65, 0.3, 0.72, 0.95, 0.1, 0.5][i];
    const overrun = risk > 0.8 ? g.normal(1.12, 0.04) : risk > 0.6 ? g.normal(1.03, 0.02) : g.normal(0.95, 0.03);
    const spent = Math.round(budget * Math.min(1.2, elapsed * overrun));
    const done = elapsed >= 1;
    const status = done ? "Completed" : risk > 0.8 ? "At Risk" : risk > 0.6 ? "Watch" : "On Track";
    projects.push({ ProjectID: `PRJ-${pad(i + 1, 3)}`, ProjectName: name, Sector: sector, ProjectManager: g.pick(pms), StartDate: iso(start), PlannedEndDate: iso(end), BudgetNGN: budget, SpentNGN: spent, PercentComplete: Math.round(elapsed * 100), Status: status });
    stages.forEach((s, k) => {
      const planned = addDays(start, Math.round(((k + 1) / stages.length) * durationDays));
      const slip = risk > 0.8 ? g.int(3, 14) : risk > 0.6 ? g.int(0, 6) : g.int(-2, 3);
      const actual = addDays(planned, slip);
      const complete = actual <= asOf;
      milestones.push({ ProjectID: `PRJ-${pad(i + 1, 3)}`, Milestone: s, PlannedDate: iso(planned), ActualDate: complete ? iso(actual) : "", Status: complete ? (slip > 2 ? "Completed Late" : "Completed") : planned < asOf ? "Overdue" : "Upcoming" });
    });
  });
  const engineers = Array.from({ length: 14 }, (_, i) => ({ Engineer: `Engineer ${pad(i + 1, 2)}`, Team: ["Network", "Network", "Infrastructure", "Power & Electrical", "Field Support"][i % 5] }));
  const utilisation = [];
  for (let w = 0; w < 52; w++) {
    const week = iso(addDays(new Date(Date.UTC(YEAR, 0, 6)), w * 7));
    for (const e of engineers) {
      const avail = 40 - (g.r() < 0.06 ? 8 : 0);
      const load = Math.min(avail + 6, Math.max(12, Math.round(g.normal(avail * (0.72 + 0.12 * season(new Date(week))), 5))));
      utilisation.push({ WeekStarting: week, Engineer: e.Engineer, Team: e.Team, HoursAvailable: avail, HoursAllocated: load });
    }
  }
  csv("Project-Management-Dashboard/dataset/projects.csv", projects);
  csv("Project-Management-Dashboard/dataset/milestones.csv", milestones);
  csv("Project-Management-Dashboard/dataset/resource_utilisation.csv", utilisation);
}

// ---------- 5. Network infrastructure ----------
{
  const g = make(505);
  const sites = [
    ["Site A – Head Office", "Fibre", 1000], ["Site B – Court Complex", "Fibre", 500], ["Site C – Ministry Annex", "Fibre", 300],
    ["Site D – Branch Office", "Microwave", 200], ["Site E – Warehouse", "Starlink", 220], ["Site F – Rural Outpost", "Starlink", 150],
  ].map(([Site, PrimaryLink, CapacityMbps], i) => ({ SiteID: `S${i + 1}`, Site, PrimaryLink, CapacityMbps }));
  const types = [["Router", 1], ["Core Switch", 1], ["Access Switch", 4], ["Access Point", 8], ["Firewall", 1], ["NVR", 1], ["UPS", 2]];
  const devices = [];
  let dn = 1;
  for (const s of sites) for (const [t, n] of types) for (let k = 0; k < Math.max(1, Math.round(n * (s.CapacityMbps / 500))); k++) devices.push({ DeviceID: `DEV-${pad(dn++)}`, SiteID: s.SiteID, DeviceType: t, Vendor: t === "Access Point" ? "Ubiquiti" : t === "Router" ? "MikroTik" : t === "NVR" ? "Hikvision" : t === "UPS" ? "APC" : "Cisco", Status: g.r() < 0.93 ? "Healthy" : g.r() < 0.6 ? "Warning" : "Critical" });
  const daily = [];
  const incidents = [];
  let inc = 1;
  const reliability = { S1: 0.9994, S2: 0.9985, S3: 0.9978, S4: 0.9955, S5: 0.9968, S6: 0.9925 };
  for (const d of days) {
    for (const s of sites) {
      const outage = g.r() > reliability[s.SiteID] ** 12 ? Math.round(Math.abs(g.normal(95, 70))) : 0;
      const util = Math.min(0.95, Math.max(0.08, g.normal((weekday(d) ? 0.46 : 0.18) * season(d), 0.07)));
      daily.push({ Date: iso(d), SiteID: s.SiteID, UptimeMinutes: 1440 - outage, DowntimeMinutes: outage, AvgUtilisationMbps: round(s.CapacityMbps * util, 1), PeakUtilisationMbps: round(Math.min(s.CapacityMbps, s.CapacityMbps * util * g.normal(1.8, 0.2)), 1) });
      if (outage > 0 || g.r() < 0.012) {
        const severity = outage > 180 ? "P1" : outage > 60 ? "P2" : "P3";
        const opened = new Date(d.getTime() + g.int(0, 1300) * 60000);
        const mttr = outage || g.int(15, 90);
        incidents.push({ IncidentID: `INC-${pad(inc++, 5)}`, SiteID: s.SiteID, Opened: opened.toISOString().slice(0, 16).replace("T", " "), Resolved: new Date(opened.getTime() + mttr * 60000).toISOString().slice(0, 16).replace("T", " "), Severity: severity, Category: g.weighted([["Power", 3], ["Link / ISP", 4], ["Hardware", 2], ["Configuration", 1.5], ["Weather", s.PrimaryLink === "Fibre" ? 0.3 : 2]]), ResolutionMinutes: mttr });
      }
    }
  }
  csv("Network-Infrastructure-Dashboard/dataset/sites.csv", sites);
  csv("Network-Infrastructure-Dashboard/dataset/devices.csv", devices);
  csv("Network-Infrastructure-Dashboard/dataset/daily_site_metrics.csv", daily);
  csv("Network-Infrastructure-Dashboard/dataset/incidents.csv", incidents);
}

// ---------- 6. Court digitalization ----------
{
  const g = make(606);
  const courts = [
    ["Court A – High Court", 6], ["Court B – Appellate Division", 4], ["Court C – Magistrate Court", 5],
  ].map(([Court, Courtrooms], i) => ({ CourtID: `CT${i + 1}`, Court, Courtrooms, DigitalRoomsGoLive: iso(new Date(Date.UTC(YEAR, 1 + i * 2, 1))) }));
  const caseTypes = [["Civil", 4], ["Criminal", 3], ["Commercial", 2], ["Family", 1.5], ["Appeal", 1]];
  const hearings = [];
  const techIssues = [];
  let h = 1;
  let t = 1;
  for (const d of days) {
    if (!weekday(d)) continue;
    if (d.getUTCMonth() === 7 && d.getUTCDate() < 25) continue; // court vacation
    for (const c of courts) {
      const live = d >= new Date(c.DigitalRoomsGoLive);
      const monthsLive = live ? (d - new Date(c.DigitalRoomsGoLive)) / (30 * 86400000) : 0;
      const virtualShare = live ? Math.min(0.55, 0.12 + monthsLive * 0.05) : 0.03;
      const n = Math.round(g.normal(c.Courtrooms * 2.2, 2));
      for (let i = 0; i < n; i++) {
        const mode = g.r() < virtualShare ? (g.r() < 0.7 ? "Virtual" : "Hybrid") : "In-person";
        const issue = mode !== "In-person" && g.r() < Math.max(0.04, 0.22 - monthsLive * 0.02);
        const adjourned = g.r() < (issue ? 0.35 : mode === "In-person" ? 0.24 : 0.16);
        const hid = `HRG-${pad(h++, 5)}`;
        hearings.push({ HearingID: hid, Date: iso(d), CourtID: c.CourtID, CaseType: g.weighted(caseTypes), Mode: mode, DurationMinutes: Math.max(10, Math.round(g.normal(mode === "In-person" ? 48 : 38, 15))), Adjourned: adjourned ? "Y" : "N", TechIssue: issue ? "Y" : "N" });
        if (issue) techIssues.push({ IssueID: `TI-${pad(t++, 5)}`, HearingID: hid, Date: iso(d), CourtID: c.CourtID, Category: g.weighted([["Audio", 4], ["Video", 3], ["Connectivity", 4], ["Participant Device", 3], ["Power", 1]]), MinutesLost: g.int(3, 40) });
      }
    }
  }
  csv("Court-Digitalization-Dashboard/dataset/courts.csv", courts);
  csv("Court-Digitalization-Dashboard/dataset/hearings.csv", hearings);
  csv("Court-Digitalization-Dashboard/dataset/tech_issues.csv", techIssues);
}
