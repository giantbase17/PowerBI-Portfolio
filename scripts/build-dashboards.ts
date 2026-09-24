// Reads every dataset, computes the report KPIs and writes, per dashboard:
//   <Dashboard>/summary.json             headline KPIs (also used by the portfolio site)
//   <Dashboard>/screenshots/report.html  a static preview of the Power BI report page
//
//   npm run build
//   npm run screenshots   (turns report.html into PNGs, needs Playwright)
//
// The preview mirrors the report layout described in each README so the page can be
// rebuilt visual-for-visual in Power BI Desktop from the same CSVs.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AccountType,
  Actual,
  Budget,
  Cell,
  Court,
  Customer,
  DailySiteMetric,
  Device,
  Hearing,
  HearingMode,
  Incident,
  Milestone,
  MilestoneStatus,
  Product,
  Project,
  ProjectStatus,
  Route,
  Sale,
  Severity,
  Shipment,
  Site,
  TechIssue,
  Utilisation,
} from "./types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- data helpers ----------
// Keys of R whose values are numbers, e.g. NumericKey<Actual> = "ActualNGN".
type NumericKey<R> = { [K in keyof R]: R[K] extends number ? K : never }[keyof R];
type StringKey<R> = { [K in keyof R]: R[K] extends string ? K : never }[keyof R];

// Parses one of this repo's CSVs. Numeric-looking cells become numbers; the row
// type T is the caller's promise about the file (see scripts/types.ts).
function load<T>(file: string): T[] {
  const [head, ...lines] = readFileSync(join(root, file), "utf8").trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => {
    const cells = (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'));
    const toCell = (v: string): Cell => (v === "" || isNaN(Number(v)) ? v : Number(v));
    return Object.fromEntries(cols.map((c, i) => [c, toCell(cells[i])])) as T;
  });
}
function sum(a: readonly number[]): number;
function sum<T>(a: readonly T[], f: (x: T) => number): number;
function sum<T>(a: readonly T[], f: (x: T) => number = (x) => x as number): number {
  return a.reduce((s, x) => s + f(x), 0);
}
const avg = <T>(a: readonly T[], f: (x: T) => number): number => (a.length ? sum(a, f) / a.length : 0);
function group<T>(a: readonly T[], key: StringKey<T>): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const x of a) (out[x[key] as string] ||= []).push(x);
  return out;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthOf = (d: string): number => Number(d.slice(5, 7)) - 1;
const byMonth = <T>(rows: readonly T[], dateKey: StringKey<T>, f: (rows: T[]) => number): number[] =>
  MONTHS.map((_, m) => f(rows.filter((r) => monthOf(r[dateKey] as string) === m)));
const pct = (n: number, d = 1): string => `${(n * 100).toFixed(d)}%`;
const naira = (n: number): string =>
  Math.abs(n) >= 1e9 ? `₦${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `₦${(n / 1e6).toFixed(1)}M` : `₦${Math.round(n / 1e3)}K`;
const num = (n: number): string => n.toLocaleString("en-US");
const fmtM = (v: number): string => `${Math.round(v / 1e6)}M`;

// ---------- theme (validated: series pass CVD + contrast checks on the card surface) ----------
const T = {
  bg: "#0b1222", card: "#111a2e", line: "#1f2b45", grid: "#1c2740",
  text: "#e8eef8", text2: "#a9b6cc", muted: "#7c8aa5",
  s1: "#2b9fd9", s2: "#d95926", s3: "#9085e9",
  good: "#0ca30c", warn: "#fab219", bad: "#d03b3b",
} as const;

// ---------- SVG chart helpers (single axis, thin marks, recessive grid) ----------
type Fmt = (v: number) => string;
interface Series {
  name?: string;
  values: number[];
  color: string;
}
interface Target {
  value: number;
  label: string;
}
interface BarRow {
  label: string;
  value: number;
}
interface Slice extends BarRow {
  color: string;
}
interface Padding {
  t: number;
  r: number;
  b: number;
  l: number;
}
type StatusKind = "good" | "warn" | "bad" | "idle";
interface Kpi {
  label: string;
  value: string;
  note?: string;
}

const esc = (s: string | number): string => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
function niceMax(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v || 1));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}
function axisY(W: number, H: number, pad: Padding, max: number, fmt: Fmt): string {
  let s = "";
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (H - pad.t - pad.b) * (1 - i / 4);
    s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}" stroke="${T.grid}" stroke-width="1"/>`;
    s += `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${T.muted}">${esc(fmt((max * i) / 4))}</text>`;
  }
  return s;
}
function columns({ labels, series, W = 560, H = 230, fmt = num, stacked = false, max }: {
  labels: readonly string[];
  series: readonly Series[];
  W?: number;
  H?: number;
  fmt?: Fmt;
  stacked?: boolean;
  max?: number;
}): string {
  const pad: Padding = { t: 12, r: 8, b: 26, l: 52 };
  const totals = labels.map((_, i) => (stacked ? sum(series, (s) => s.values[i]) : Math.max(...series.map((s) => s.values[i]))));
  const top = max ?? niceMax(Math.max(...totals));
  const band = (W - pad.l - pad.r) / labels.length;
  const inner = H - pad.t - pad.b;
  const groupW = band * 0.64;
  const barW = stacked ? groupW : (groupW - (series.length - 1) * 2) / series.length;
  let s = axisY(W, H, pad, top, fmt);
  labels.forEach((l, i) => {
    const x0 = pad.l + band * i + (band - groupW) / 2;
    let yAcc = pad.t + inner;
    series.forEach((ser, k) => {
      const h = (ser.values[i] / top) * inner;
      const x = stacked ? x0 : x0 + k * (barW + 2);
      const y = stacked ? yAcc - h : pad.t + inner - h;
      const isTop = !stacked || k === series.length - 1;
      s += isTop
        ? `<path d="M${x},${y + h} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, barW / 2)},${y} H${x + barW - Math.min(4, barW / 2)} Q${x + barW},${y} ${x + barW},${y + Math.min(4, h)} V${y + h} Z" fill="${ser.color}"/>`
        : `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(0, h - 2)}" fill="${ser.color}"/>`;
      if (stacked) yAcc -= h;
    });
    s += `<text x="${pad.l + band * i + band / 2}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${T.muted}">${esc(l)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${s}</svg>`;
}
function lines({ labels, series, W = 560, H = 230, fmt = num, min = 0, max, target, area = false }: {
  labels: readonly string[];
  series: readonly Series[];
  W?: number;
  H?: number;
  fmt?: Fmt;
  min?: number;
  max?: number;
  target?: Target;
  area?: boolean;
}): string {
  const pad: Padding = { t: 12, r: 70, b: 26, l: 52 };
  const all = series.flatMap((s) => s.values);
  const top = max ?? niceMax(Math.max(...all));
  const inner = H - pad.t - pad.b;
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / (labels.length - 1);
  const y = (v: number) => pad.t + inner * (1 - (v - min) / (top - min));
  let s = "";
  for (let i = 0; i <= 4; i++) {
    const v = min + ((top - min) * i) / 4;
    s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="${T.grid}"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${T.muted}">${esc(fmt(v))}</text>`;
  }
  if (target != null) s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(target.value)}" y2="${y(target.value)}" stroke="${T.text2}" stroke-dasharray="4 4"/><text x="${W - pad.r + 6}" y="${y(target.value) + 4}" font-size="11" fill="${T.text2}">${esc(target.label)}</text>`;
  series.forEach((ser) => {
    const pts = ser.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
    if (area) s += `<polygon points="${x(0)},${y(min)} ${pts} ${x(ser.values.length - 1)},${y(min)}" fill="${ser.color}" opacity="0.14"/>`;
    s += `<polyline points="${pts}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round"/>`;
    const last = ser.values.length - 1;
    s += `<circle cx="${x(last)}" cy="${y(ser.values[last])}" r="4" fill="${ser.color}" stroke="${T.card}" stroke-width="2"/>`;
    if (series.length > 1) s += `<text x="${x(last) + 8}" y="${y(ser.values[last]) + 4}" font-size="11" fill="${T.text2}">${esc(ser.name ?? "")}</text>`;
  });
  const step = labels.length > 12 ? Math.ceil(labels.length / 12) : 1;
  labels.forEach((l, i) => {
    if (i % step === 0) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${T.muted}">${esc(l)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${s}</svg>`;
}
function hbars<R extends BarRow>({ rows, W = 560, fmt = num, min = 0, max, target, colorOf = () => T.s1, labelW = 170 }: {
  rows: readonly R[];
  W?: number;
  fmt?: Fmt;
  min?: number;
  max?: number;
  target?: Target;
  colorOf?: (r: R) => string;
  labelW?: number;
}): string {
  const rowH = 26;
  const H = rows.length * rowH + 22;
  const top = max ?? niceMax(Math.max(...rows.map((r) => r.value)));
  const x0 = labelW;
  const span = W - x0 - 64;
  let s = "";
  rows.forEach((r, i) => {
    const y = 6 + i * rowH;
    const w = Math.max(2, ((r.value - min) / (top - min)) * span);
    s += `<text x="${x0 - 10}" y="${y + 13}" text-anchor="end" font-size="12" fill="${T.text2}">${esc(r.label)}</text>`;
    s += `<rect x="${x0}" y="${y + 2}" width="${span}" height="14" rx="4" fill="${T.grid}"/>`;
    s += `<path d="M${x0},${y + 2} H${x0 + w - 4} Q${x0 + w},${y + 2} ${x0 + w},${y + 6} V${y + 12} Q${x0 + w},${y + 16} ${x0 + w - 4},${y + 16} H${x0} Z" fill="${colorOf(r)}"/>`;
    s += `<text x="${x0 + span + 8}" y="${y + 13}" font-size="12" fill="${T.text}">${esc(fmt(r.value))}</text>`;
  });
  if (target) {
    const tx = x0 + ((target.value - min) / (top - min)) * span;
    s += `<line x1="${tx}" x2="${tx}" y1="2" y2="${H - 18}" stroke="${T.text2}" stroke-dasharray="3 3"/><text x="${tx}" y="${H - 4}" text-anchor="middle" font-size="11" fill="${T.text2}">${esc(target.label)}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${s}</svg>`;
}
function donut({ slices, size = 170, center }: { slices: readonly Slice[]; size?: number; center?: readonly [string, string] }): string {
  const total = sum(slices, (s) => s.value);
  const r = size / 2 - 12;
  const c = size / 2;
  let a = -Math.PI / 2;
  let s = "";
  slices.forEach((sl) => {
    const da = (sl.value / total) * Math.PI * 2;
    const a2 = a + da - 0.03;
    const large = da > Math.PI ? 1 : 0;
    s += `<path d="M${c + r * Math.cos(a)},${c + r * Math.sin(a)} A${r},${r} 0 ${large} 1 ${c + r * Math.cos(a2)},${c + r * Math.sin(a2)}" fill="none" stroke="${sl.color}" stroke-width="18"/>`;
    a += da;
  });
  if (center) s += `<text x="${c}" y="${c - 2}" text-anchor="middle" font-size="22" font-weight="700" fill="${T.text}">${esc(center[0])}</text><text x="${c}" y="${c + 18}" text-anchor="middle" font-size="11" fill="${T.muted}">${esc(center[1])}</text>`;
  const legend = slices
    .map((sl) => `<li><i style="background:${sl.color}"></i><span>${esc(sl.label)}</span><b>${pct(sl.value / total, 0)}</b></li>`)
    .join("");
  return `<div class="donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${s}</svg><ul class="legend">${legend}</ul></div>`;
}
function legend(items: readonly { name: string; color: string }[]): string {
  return `<ul class="keys">${items.map((i) => `<li><i style="background:${i.color}"></i>${esc(i.name)}</li>`).join("")}</ul>`;
}
// Cells are HTML: escape plain text before passing it in.
function table(head: readonly string[], rows: readonly (readonly string[])[]): string {
  return `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}
const status = (kind: StatusKind, label: string): string => `<span class="status ${kind}"><i></i>${esc(label)}</span>`;
const bar = (p: number, color: string = T.s1): string => `<span class="meter"><span style="width:${Math.min(100, p * 100)}%;background:${color}"></span></span>`;

function page({ title, subtitle, filters, kpis, body }: { title: string; subtitle: string; filters: readonly string[]; kpis: readonly Kpi[]; body: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{width:1600px;height:1000px;background:${T.bg};color:${T.text};font-family:"Segoe UI",Inter,system-ui,sans-serif;padding:26px 30px;overflow:hidden}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px}
h1{font-size:26px;font-weight:700;letter-spacing:-.01em}
header p{color:${T.text2};font-size:13px;margin-top:4px}
.filters{display:flex;gap:8px}
.filters span{border:1px solid ${T.line};background:${T.card};color:${T.text2};font-size:12px;padding:7px 12px;border-radius:8px}
.filters span b{color:${T.text};font-weight:600}
.filters .tag{border-color:#3b3420;color:#e9c46a}
.kpis{display:grid;grid-template-columns:repeat(${kpis.length},1fr);gap:14px;margin-bottom:14px}
.kpi{background:${T.card};border:1px solid ${T.line};border-radius:12px;padding:14px 16px}
.kpi small{color:${T.text2};font-size:12px}
.kpi strong{display:block;font-size:28px;font-weight:700;margin-top:4px;letter-spacing:-.01em}
.kpi em{font-style:normal;font-size:12px;color:${T.muted}}
.grid{display:grid;gap:14px}
.card{background:${T.card};border:1px solid ${T.line};border-radius:12px;padding:14px 16px;overflow:hidden}
.card h2{font-size:14px;font-weight:600;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.card h2 small{font-weight:400;color:${T.muted};font-size:11px}
.keys{display:flex;gap:14px;list-style:none;font-size:11px;color:${T.text2};margin:-2px 0 6px}
.keys i,.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.donut{display:flex;align-items:center;gap:18px}
.legend{list-style:none;font-size:12px;color:${T.text2};display:grid;gap:8px}
.legend li{display:flex;align-items:center;gap:4px}.legend b{color:${T.text};margin-left:8px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;color:${T.muted};font-weight:500;padding:6px 8px;border-bottom:1px solid ${T.line}}
td{padding:7px 8px;border-bottom:1px solid ${T.grid};color:${T.text2}}
td:first-child{color:${T.text}}
.status{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:${T.text}}
.status i{width:8px;height:8px;border-radius:50%}
.status.good i{background:${T.good}}.status.warn i{background:${T.warn}}.status.bad i{background:${T.bad}}.status.idle i{background:${T.muted}}
.meter{display:inline-block;width:90px;height:8px;border-radius:4px;background:${T.grid};vertical-align:middle;overflow:hidden}
.meter span{display:block;height:100%;border-radius:4px}
footer{position:absolute;bottom:14px;left:30px;right:30px;display:flex;justify-content:space-between;font-size:11px;color:${T.muted}}
</style></head><body>
<header><div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div><div class="filters">${filters
    .map((f) => `<span>${f}</span>`)
    .join("")}<span class="tag">Sample data</span></div></header>
<section class="kpis">${kpis.map((k) => `<div class="kpi"><small>${esc(k.label)}</small><strong>${esc(k.value)}</strong><em>${esc(k.note ?? "")}</em></div>`).join("")}</section>
${body}
<footer><span>Onu Emeka Barnabas · Power BI Portfolio</span><span>Data: synthetic sample, Jan–Dec 2025</span></footer>
</body></html>`;
}
// Inner SVG width for column i of a card grid with the given fr ratios (1540px content, 14px gaps, 34px card padding).
const colW = (ratios: readonly number[], i: number): number => Math.floor(((1540 - 14 * (ratios.length - 1)) * ratios[i]) / ratios.reduce((a, b) => a + b, 0) - 34);
const card = (title: string, content: string, extra = ""): string => `<div class="card"><h2>${esc(title)}${extra.startsWith("<ul") ? "" : extra}</h2>${extra.startsWith("<ul") ? extra : ""}${content}</div>`;

function write(dir: string, summary: { kpis: readonly Kpi[] } & Record<string, unknown>, html: string): void {
  mkdirSync(join(root, dir, "screenshots"), { recursive: true });
  writeFileSync(join(root, dir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
  writeFileSync(join(root, dir, "screenshots", "report.html"), html);
  console.log(`${dir}: ${summary.kpis.map((k) => `${k.label} ${k.value}`).join(" · ")}`);
}

// ---------- 1. Logistics ----------
{
  const routes = load<Route>("Logistics-Dashboard/dataset/routes.csv");
  const ships = load<Shipment>("Logistics-Dashboard/dataset/shipments.csv");
  const onTime = (rs: readonly Shipment[]): number => (rs.length ? rs.filter((r) => r.OnTime === "Y").length / rs.length : 0);
  const kpis: Kpi[] = [
    { label: "Total shipments", value: num(ships.length), note: "Jan–Dec 2025" },
    { label: "On-time delivery", value: pct(onTime(ships)), note: "Target 85%" },
    { label: "Avg transit time", value: `${avg(ships, (s) => s.ActualDays).toFixed(2)} days`, note: `Promised ${avg(ships, (s) => s.PromisedDays).toFixed(2)} days` },
    { label: "Freight cost", value: naira(sum(ships, (s) => s.FreightCostNGN)), note: `₦${Math.round(sum(ships, (s) => s.FreightCostNGN) / sum(ships, (s) => s.WeightKg))} per kg` },
    { label: "Tonnage moved", value: `${num(Math.round(sum(ships, (s) => s.WeightKg) / 1000))} t`, note: `${num(Math.round(avg(ships, (s) => s.WeightKg)))} kg avg load` },
  ];
  const byRoute = group(ships, "RouteID");
  const routeRows = routes
    .map((r) => ({ label: `${r.Origin} → ${r.Destination}`, value: onTime(byRoute[r.RouteID] || []) * 100, n: (byRoute[r.RouteID] || []).length, km: r.DistanceKm, cost: sum(byRoute[r.RouteID] || [], (s) => s.FreightCostNGN) }))
    .sort((a, b) => b.value - a.value);
  const carriers = group(ships, "Carrier");
  const html = page({
    title: "Logistics Operations Dashboard",
    subtitle: "Shipment volumes, route efficiency and delivery performance across 10 domestic routes",
    filters: ["Year <b>2025</b>", "Route <b>All</b>", "Carrier <b>All</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1.25fr 1fr">
      ${card("Monthly shipment volume", columns({ labels: MONTHS, series: [{ values: byMonth(ships, "ShipDate", (r) => r.length), color: T.s1 }], W: colW([1.25, 1], 0), H: 300 }))}
      ${card("On-time delivery rate by month", lines({ labels: MONTHS, series: [{ name: "On-time %", values: byMonth(ships, "ShipDate", (r) => onTime(r) * 100), color: T.s1 }], W: colW([1.25, 1], 1), H: 300, min: 60, max: 100, fmt: (v) => `${v.toFixed(0)}%`, target: { value: 85, label: "Target 85%" }, area: true }))}
    </div>
    <div class="grid" style="grid-template-columns:1.25fr .6fr .95fr;margin-top:14px">
      ${card("On-time rate by route", hbars({ rows: routeRows, W: colW([1.25, 0.6, 0.95], 0), max: 100, fmt: (v) => `${v.toFixed(0)}%`, target: { value: 85, label: "85%" }, colorOf: (r) => (r.value < 80 ? T.s2 : T.s1), labelW: 200 }), `<small>Orange: below 80%</small>`)}
      ${card("Shipments by carrier", donut({ slices: Object.entries(carriers).sort((a, b) => b[1].length - a[1].length).map(([k, v], i) => ({ label: k, value: v.length, color: [T.s1, T.s2, T.s3][i] })), center: [num(ships.length), "shipments"] }))}
      ${card("Busiest routes", table(["Route", "Shipments", "Km", "On-time"], [...routeRows].sort((a, b) => b.n - a.n).slice(0, 7).map((r) => [esc(r.label), num(r.n), num(r.km), r.value >= 85 ? status("good", `${r.value.toFixed(0)}%`) : r.value >= 80 ? status("warn", `${r.value.toFixed(0)}%`) : status("bad", `${r.value.toFixed(0)}%`)])))}
    </div>`,
  });
  write("Logistics-Dashboard", { kpis, worstRoute: routeRows.at(-1), bestRoute: routeRows[0] }, html);
}

// ---------- 2. Sales ----------
{
  const products = Object.fromEntries(load<Product>("Sales-Dashboard/dataset/products.csv").map((p) => [p.ProductID, p]));
  const customers = Object.fromEntries(load<Customer>("Sales-Dashboard/dataset/customers.csv").map((c) => [c.CustomerID, c]));
  const sales = load<Sale>("Sales-Dashboard/dataset/sales.csv").map((s) => ({ ...s, ...products[s.ProductID], ...customers[s.CustomerID] }));
  const rev = sum(sales, (s) => s.RevenueNGN);
  const profit = sum(sales, (s) => s.ProfitNGN);
  const h1 = sum(sales.filter((s) => monthOf(s.OrderDate) < 6), (s) => s.RevenueNGN);
  const h2 = rev - h1;
  const kpis: Kpi[] = [
    { label: "Revenue", value: naira(rev), note: `H2 vs H1 ${h2 > h1 ? "+" : ""}${pct(h2 / h1 - 1)}` },
    { label: "Gross profit", value: naira(profit), note: "Revenue − cost of goods" },
    { label: "Gross margin", value: pct(profit / rev), note: "After discounts" },
    { label: "Orders", value: num(sales.length), note: `${num(new Set(sales.map((s) => s.CustomerID)).size)} customers` },
    { label: "Avg order value", value: naira(rev / sales.length), note: "Revenue ÷ orders" },
  ];
  const cat = Object.entries(group(sales, "Category")).map(([k, v]) => ({ label: k, value: sum(v, (s) => s.RevenueNGN), margin: sum(v, (s) => s.ProfitNGN) / sum(v, (s) => s.RevenueNGN) })).sort((a, b) => b.value - a.value);
  const reg = Object.entries(group(sales, "Region")).map(([k, v]) => ({ label: k, value: sum(v, (s) => s.RevenueNGN) })).sort((a, b) => b.value - a.value);
  const seg = Object.entries(group(sales, "Segment")).map(([k, v]) => ({ label: k, value: sum(v, (s) => s.RevenueNGN), orders: v.length, customers: new Set(v.map((x) => x.CustomerID)).size })).sort((a, b) => b.value - a.value);
  const prod = Object.entries(group(sales, "Product")).map(([k, v]) => ({ label: k, value: sum(v, (s) => s.RevenueNGN), units: sum(v, (s) => s.Quantity), margin: sum(v, (s) => s.ProfitNGN) / sum(v, (s) => s.RevenueNGN) })).sort((a, b) => b.value - a.value);
  const html = page({
    title: "Sales Performance Dashboard",
    subtitle: "Revenue, profitability, products and customer segments for a network & power equipment distributor",
    filters: ["Year <b>2025</b>", "Region <b>All</b>", "Segment <b>All</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1.3fr 1fr">
      ${card("Monthly revenue and gross profit (₦)", lines({ labels: MONTHS, series: [{ name: "Revenue", values: byMonth(sales, "OrderDate", (r) => sum(r, (s) => s.RevenueNGN)), color: T.s1 }, { name: "Profit", values: byMonth(sales, "OrderDate", (r) => sum(r, (s) => s.ProfitNGN)), color: T.s2 }], W: colW([1.3, 1], 0), H: 300, fmt: fmtM }), legend([{ name: "Revenue", color: T.s1 }, { name: "Gross profit", color: T.s2 }]))}
      ${card("Revenue by region", hbars({ rows: reg, W: colW([1.3, 1], 1), fmt: naira, labelW: 130 }))}
    </div>
    <div class="grid" style="grid-template-columns:.9fr 1fr 1.2fr;margin-top:14px">
      ${card("Revenue and margin by category", table(["Category", "Revenue", "Margin", ""], cat.map((c) => [c.label, naira(c.value), pct(c.margin), bar(c.value / cat[0].value)])))}
      ${card("Customer segments", table(["Segment", "Revenue", "Orders", "Customers"], seg.map((s) => [s.label, naira(s.value), num(s.orders), num(s.customers)])))}
      ${card("Top products by revenue", table(["Product", "Revenue", "Units", "Margin"], prod.slice(0, 7).map((p) => [p.label, naira(p.value), num(p.units), pct(p.margin)])))}
    </div>`,
  });
  write("Sales-Dashboard", { kpis, topCategory: cat[0], topRegion: reg[0], topProduct: prod[0] }, html);
}

// ---------- 3. Business performance ----------
{
  const actuals = load<Actual>("Business-Performance-Dashboard/dataset/actuals.csv");
  const budget = load<Budget>("Business-Performance-Dashboard/dataset/budget.csv");
  const tot = <R extends Actual | Budget>(rows: readonly R[], type: AccountType, key: NumericKey<R>): number =>
    sum(rows.filter((r) => r.AccountType === type), (r) => r[key] as number);
  const revA = tot(actuals, "Revenue", "ActualNGN");
  const revB = tot(budget, "Revenue", "BudgetNGN");
  const expA = tot(actuals, "Expense", "ActualNGN");
  const expB = tot(budget, "Expense", "BudgetNGN");
  const netA = revA - expA;
  const netB = revB - expB;
  const monthly = <R extends Actual | Budget>(rows: readonly R[], key: NumericKey<R>): number[] =>
    // Actual and Budget both carry a string Month column; TypeScript cannot see that through the generic.
    byMonth(rows, "Month" as StringKey<R>, (r) => tot(r, "Revenue", key) - tot(r, "Expense", key));
  const q = (m: number): number => Math.floor(m / 3);
  const q4 = sum(actuals.filter((r) => r.AccountType === "Revenue" && q(monthOf(r.Month)) === 3), (r) => r.ActualNGN);
  const q1 = sum(actuals.filter((r) => r.AccountType === "Revenue" && q(monthOf(r.Month)) === 0), (r) => r.ActualNGN);
  const kpis: Kpi[] = [
    { label: "Revenue (actual)", value: naira(revA), note: `${revA >= revB ? "+" : ""}${pct(revA / revB - 1)} vs budget` },
    { label: "Operating expenses", value: naira(expA), note: `${expA >= expB ? "+" : ""}${pct(expA / expB - 1)} vs budget` },
    { label: "Net profit", value: naira(netA), note: `Budget ${naira(netB)}` },
    { label: "Net margin", value: pct(netA / revA), note: `Budget ${pct(netB / revB)}` },
    { label: "Revenue growth", value: pct(q4 / q1 - 1), note: "Q4 vs Q1" },
  ];
  const expCats = [...new Set(actuals.filter((r) => r.AccountType === "Expense").map((r) => r.Category))];
  const catRows = (type: AccountType) =>
    [...new Set(actuals.filter((r) => r.AccountType === type).map((r) => r.Category))].map((c) => {
      const a = sum(actuals.filter((r) => r.Category === c), (r) => r.ActualNGN);
      const b = sum(budget.filter((r) => r.Category === c), (r) => r.BudgetNGN);
      return { c, a, b, v: a / b - 1 };
    });
  const varCell = (v: number, good: boolean): string => (Math.abs(v) < 0.02 ? status("idle", pct(v)) : good ? status("good", `${v > 0 ? "+" : ""}${pct(v)}`) : status("bad", `${v > 0 ? "+" : ""}${pct(v)}`));
  const html = page({
    title: "Business Performance Dashboard",
    subtitle: "Executive view of revenue, expenses and profitability against the 2025 budget",
    filters: ["Year <b>2025</b>", "Scenario <b>Actual vs Budget</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1.3fr 1fr">
      ${card("Revenue: actual vs budget (₦)", columns({ labels: MONTHS, series: [{ values: byMonth(actuals, "Month", (r) => tot(r, "Revenue", "ActualNGN")), color: T.s1 }, { values: byMonth(budget, "Month", (r) => tot(r, "Revenue", "BudgetNGN")), color: T.s3 }], W: colW([1.3, 1], 0), H: 300, fmt: fmtM }), legend([{ name: "Actual", color: T.s1 }, { name: "Budget", color: T.s3 }]))}
      ${card("Monthly net profit (₦)", lines({ labels: MONTHS, series: [{ name: "Actual", values: monthly(actuals, "ActualNGN"), color: T.s1 }, { name: "Budget", values: monthly(budget, "BudgetNGN"), color: T.s3 }], W: colW([1.3, 1], 1), H: 300, fmt: fmtM }), legend([{ name: "Actual", color: T.s1 }, { name: "Budget", color: T.s3 }]))}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:14px">
      ${card("Profit & loss summary", table(["Line", "Actual", "Budget", "Variance"], [
        ...catRows("Revenue").map((r) => [r.c, naira(r.a), naira(r.b), varCell(r.v, r.v >= 0)]),
        [`<b>Total revenue</b>`, `<b>${naira(revA)}</b>`, naira(revB), varCell(revA / revB - 1, revA >= revB)],
        [`<b>Total expenses</b>`, `<b>${naira(expA)}</b>`, naira(expB), varCell(expA / expB - 1, expA <= expB)],
        [`<b>Net profit</b>`, `<b>${naira(netA)}</b>`, naira(netB), varCell(netA / netB - 1, netA >= netB)],
      ]))}
      ${card("Expenses: actual vs budget", table(["Category", "Actual", "Budget", "Variance", "Share"], catRows("Expense").sort((a, b) => b.a - a.a).map((r) => [r.c, naira(r.a), naira(r.b), varCell(r.v, r.v <= 0), bar(r.a / expA)])))}
    </div>`,
  });
  write("Business-Performance-Dashboard", { kpis, expenseCategories: expCats }, html);
}

// ---------- 4. Project management ----------
{
  const projects = load<Project>("Project-Management-Dashboard/dataset/projects.csv");
  const milestones = load<Milestone>("Project-Management-Dashboard/dataset/milestones.csv");
  const util = load<Utilisation>("Project-Management-Dashboard/dataset/resource_utilisation.csv");
  const active = projects.filter((p) => p.Status !== "Completed");
  const done = milestones.filter((m) => m.ActualDate);
  const onTimeMs = done.filter((m) => m.Status === "Completed").length / done.length;
  const utilPct = sum(util, (u) => u.HoursAllocated) / sum(util, (u) => u.HoursAvailable);
  const kpis: Kpi[] = [
    { label: "Projects in portfolio", value: String(projects.length), note: `${active.length} active · ${projects.length - active.length} completed` },
    { label: "At risk", value: String(projects.filter((p) => p.Status === "At Risk").length), note: `${projects.filter((p) => p.Status === "Watch").length} on watch` },
    { label: "Milestones on time", value: pct(onTimeMs, 0), note: `${done.length} of ${milestones.length} completed` },
    { label: "Budget used", value: pct(sum(projects, (p) => p.SpentNGN) / sum(projects, (p) => p.BudgetNGN), 0), note: `${naira(sum(projects, (p) => p.SpentNGN))} of ${naira(sum(projects, (p) => p.BudgetNGN))}` },
    { label: "Team utilisation", value: pct(utilPct, 0), note: "Allocated ÷ available hours" },
  ];
  const st: Record<ProjectStatus, StatusKind> = { "On Track": "good", Watch: "warn", "At Risk": "bad", Completed: "idle" };
  const riskOrder: ProjectStatus[] = ["At Risk", "Watch", "On Track", "Completed"];
  const msStatuses: MilestoneStatus[] = ["Completed", "Completed Late", "Overdue", "Upcoming"];
  const msKind: Record<MilestoneStatus, StatusKind> = { Completed: "good", "Completed Late": "warn", Overdue: "bad", Upcoming: "idle" };
  const teams = Object.entries(group(util, "Team")).map(([k, v]) => ({ label: k, value: (sum(v, (u) => u.HoursAllocated) / sum(v, (u) => u.HoursAvailable)) * 100 })).sort((a, b) => b.value - a.value);
  const msCounts = msStatuses.map((s) => ({ s, n: milestones.filter((m) => m.Status === s).length }));
  const weekly = Object.entries(group(util, "WeekStarting")).sort().map(([, v]) => (sum(v, (u) => u.HoursAllocated) / sum(v, (u) => u.HoursAvailable)) * 100);
  const html = page({
    title: "Project Management Dashboard",
    subtitle: "Portfolio of infrastructure projects: progress, milestones, budget and team capacity",
    filters: ["Year <b>2025</b>", "Sector <b>All</b>", "PM <b>All</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1.55fr 1fr">
      ${card("Project status", table(["Project", "Sector", "Progress", "", "Budget used", "Status"], [...projects].sort((a, b) => riskOrder.indexOf(a.Status) - riskOrder.indexOf(b.Status)).slice(0, 9).map((p) => [esc(p.ProjectName), p.Sector, `${p.PercentComplete}%`, bar(p.PercentComplete / 100), pct(p.SpentNGN / p.BudgetNGN, 0), status(st[p.Status], p.Status)])))}
      <div class="grid">
        ${card("Utilisation by team", hbars({ rows: teams, W: colW([1.55, 1], 1), max: 100, fmt: (v) => `${v.toFixed(0)}%`, target: { value: 85, label: "85% cap" }, labelW: 150 }))}
        ${card("Milestones", table(["Status", "Count", ""], msCounts.map(({ s, n }) => [status(msKind[s], s), String(n), bar(n / milestones.length)])))}
      </div>
    </div>
    <div class="grid" style="margin-top:14px">
      ${card("Weekly team utilisation", lines({ labels: Object.keys(group(util, "WeekStarting")).sort().map((w, i) => (i % 4 === 0 ? MONTHS[monthOf(w)] : "")), series: [{ name: "Utilisation", values: weekly, color: T.s1 }], W: 1506, H: 190, min: 60, max: 100, fmt: (v) => `${v.toFixed(0)}%`, target: { value: 85, label: "85% cap" }, area: true }))}
    </div>`,
  });
  write("Project-Management-Dashboard", { kpis }, html);
}

// ---------- 5. Network infrastructure ----------
{
  const sites = load<Site>("Network-Infrastructure-Dashboard/dataset/sites.csv");
  const devices = load<Device>("Network-Infrastructure-Dashboard/dataset/devices.csv");
  const daily = load<DailySiteMetric>("Network-Infrastructure-Dashboard/dataset/daily_site_metrics.csv");
  const incidents = load<Incident>("Network-Infrastructure-Dashboard/dataset/incidents.csv");
  const uptime = (rs: readonly DailySiteMetric[]): number => sum(rs, (r) => r.UptimeMinutes) / (rs.length * 1440);
  const bySite = group(daily, "SiteID");
  const siteRows = sites.map((s) => ({ label: s.Site, value: uptime(bySite[s.SiteID]) * 100, link: s.PrimaryLink, cap: s.CapacityMbps, util: avg(bySite[s.SiteID], (r) => r.AvgUtilisationMbps) / s.CapacityMbps })).sort((a, b) => b.value - a.value);
  const capacity: Record<string, number> = Object.fromEntries(sites.map((s) => [s.SiteID, s.CapacityMbps]));
  const healthy = devices.filter((d) => d.Status === "Healthy").length;
  const kpis: Kpi[] = [
    { label: "Network availability", value: pct(uptime(daily), 2), note: "All sites · SLA 99.5%" },
    { label: "Devices healthy", value: `${healthy} / ${devices.length}`, note: `${devices.filter((d) => d.Status === "Critical").length} critical` },
    { label: "Incidents", value: String(incidents.length), note: `${incidents.filter((i) => i.Severity === "P1").length} P1 · ${incidents.filter((i) => i.Severity === "P2").length} P2` },
    { label: "Mean time to restore", value: `${Math.round(avg(incidents, (i) => i.ResolutionMinutes))} min`, note: "Opened → resolved" },
    { label: "Avg link utilisation", value: pct(avg(daily, (d) => d.AvgUtilisationMbps / capacity[d.SiteID]), 0), note: "Of provisioned capacity" },
  ];
  const sev: Severity[] = ["P1", "P2", "P3"];
  const sevColor: Record<Severity, string> = { P1: T.s2, P2: T.s3, P3: T.s1 };
  const cats = Object.entries(group(incidents, "Category")).map(([k, v]) => ({ label: k, value: v.length })).sort((a, b) => b.value - a.value);
  const html = page({
    title: "Network Infrastructure Dashboard",
    subtitle: "Availability, incidents, device health and bandwidth across 6 monitored sites",
    filters: ["Year <b>2025</b>", "Site <b>All</b>", "Link <b>All</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1fr 1fr">
      ${card("Availability by site", hbars({ rows: siteRows, W: colW([1, 1], 0), min: 98.5, max: 100, fmt: (v) => `${v.toFixed(2)}%`, target: { value: 99.5, label: "SLA 99.5%" }, colorOf: (r) => (r.value < 99.5 ? T.s2 : T.s1), labelW: 190 }), `<small>Axis starts at 98.5% · orange: below SLA</small>`)}
      ${card("Incidents per month by severity", columns({ labels: MONTHS, series: sev.map((s) => ({ values: byMonth(incidents.filter((i) => i.Severity === s), "Opened", (r) => r.length), color: sevColor[s] })), stacked: true, W: colW([1, 1], 1), H: 200 }), legend(sev.map((s) => ({ name: s, color: sevColor[s] }))))}
    </div>
    <div class="grid" style="grid-template-columns:1.2fr .8fr 1fr;margin-top:14px">
      ${card("Average bandwidth, all sites (Mbps)", lines({ labels: MONTHS, series: [{ name: "Avg Mbps", values: byMonth(daily, "Date", (r) => sum(r, (x) => x.AvgUtilisationMbps) / (r.length / sites.length)), color: T.s1 }], W: colW([1.2, 0.8, 1], 0), H: 270, area: true }))}
      ${card("Incidents by cause", hbars({ rows: cats, W: colW([1.2, 0.8, 1], 1), labelW: 120 }))}
      ${card("Sites", table(["Site", "Link", "Capacity", "Load", "SLA"], siteRows.map((s) => [esc(s.label.split(" – ")[0]), s.link, `${s.cap} Mbps`, pct(s.util, 0), s.value >= 99.5 ? status("good", "Met") : status("bad", "Missed")])))}
    </div>`,
  });
  write("Network-Infrastructure-Dashboard", { kpis }, html);
}

// ---------- 6. Court digitalization ----------
{
  const courts = load<Court>("Court-Digitalization-Dashboard/dataset/courts.csv");
  const hearings = load<Hearing>("Court-Digitalization-Dashboard/dataset/hearings.csv");
  const issues = load<TechIssue>("Court-Digitalization-Dashboard/dataset/tech_issues.csv");
  const remote = hearings.filter((h) => h.Mode !== "In-person");
  const adj = (rs: readonly Hearing[]): number => rs.filter((h) => h.Adjourned === "Y").length / rs.length;
  const dec = hearings.filter((h) => monthOf(h.Date) === 11);
  const kpis: Kpi[] = [
    { label: "Hearings held", value: num(hearings.length), note: `${courts.length} courts · ${sum(courts, (c) => c.Courtrooms)} courtrooms` },
    { label: "Virtual & hybrid share", value: pct(remote.length / hearings.length), note: `December: ${pct(dec.filter((h) => h.Mode !== "In-person").length / dec.length)}` },
    { label: "Tech issue rate", value: pct(issues.length / remote.length), note: "Of virtual & hybrid hearings" },
    { label: "Adjournment rate", value: pct(adj(hearings)), note: `Virtual ${pct(adj(remote))} · In-person ${pct(adj(hearings.filter((h) => h.Mode === "In-person")))}` },
    { label: "Minutes lost to tech", value: num(sum(issues, (i) => i.MinutesLost)), note: `${(sum(issues, (i) => i.MinutesLost) / issues.length).toFixed(0)} min per issue` },
  ];
  const modes: HearingMode[] = ["In-person", "Virtual", "Hybrid"];
  const modeColor: Record<HearingMode, string> = { "In-person": T.s3, Virtual: T.s1, Hybrid: T.s2 };
  const courtColor = [T.s1, T.s2, T.s3];
  const catRows = Object.entries(group(issues, "Category")).map(([k, v]) => ({ label: k, value: v.length })).sort((a, b) => b.value - a.value);
  const issueTrend = byMonth(remote, "Date", (r) => (r.length ? (r.filter((h) => h.TechIssue === "Y").length / r.length) * 100 : 0));
  const html = page({
    title: "Court Digitalization Dashboard",
    subtitle: "Virtual hearing adoption, court activity and technology reliability after digital courtroom go-live",
    filters: ["Year <b>2025</b>", "Court <b>All</b>", "Case type <b>All</b>"],
    kpis,
    body: `<div class="grid" style="grid-template-columns:1.2fr 1fr">
      ${card("Hearings per month by mode", columns({ labels: MONTHS, series: modes.map((m) => ({ values: byMonth(hearings.filter((h) => h.Mode === m), "Date", (r) => r.length), color: modeColor[m] })), stacked: true, W: colW([1.2, 1], 0), H: 290 }), legend(modes.map((m) => ({ name: m, color: modeColor[m] }))))}
      ${card("Virtual & hybrid share by court", lines({ labels: MONTHS, series: courts.map((c, i) => ({ name: c.Court.split(" – ")[0], values: byMonth(hearings.filter((h) => h.CourtID === c.CourtID), "Date", (r) => (r.length ? (r.filter((h) => h.Mode !== "In-person").length / r.length) * 100 : 0)), color: courtColor[i] })), W: colW([1.2, 1], 1), H: 290, max: 60, fmt: (v) => `${v.toFixed(0)}%` }), legend(courts.map((c, i) => ({ name: c.Court.replace(" – ", ": "), color: courtColor[i] }))))}
    </div>
    <div class="grid" style="grid-template-columns:1fr .9fr 1fr;margin-top:14px">
      ${card("Tech issue rate, virtual & hybrid hearings", lines({ labels: MONTHS, series: [{ name: "Issue rate", values: issueTrend, color: T.s1 }], W: colW([1, 0.9, 1], 0), H: 250, max: 32, fmt: (v) => `${v.toFixed(0)}%`, area: true }))}
      ${card("Tech issues by category", hbars({ rows: catRows, W: colW([1, 0.9, 1], 1), labelW: 140 }))}
      ${card("Adjournment rate by hearing mode", hbars({ rows: modes.map((m) => ({ label: m, value: adj(hearings.filter((h) => h.Mode === m)) * 100 })), W: colW([1, 0.9, 1], 2), max: 40, fmt: (v) => `${v.toFixed(1)}%`, colorOf: (r) => modeColor[r.label], labelW: 110 }))}
    </div>`,
  });
  write("Court-Digitalization-Dashboard", { kpis }, html);
}
