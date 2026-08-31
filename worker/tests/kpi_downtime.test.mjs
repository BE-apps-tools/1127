/**
 * Tests for the downtime / availability maths in kpis.html.
 *
 * These are the highest-stakes derivations in the feature — "this unit was down
 * 92 days" drives real conversations — and they live only in the page, so they
 * are lifted out of it (no build step in this repo) and exercised here against
 * timelines whose answers are known by construction.
 *
 * Dates are built relative to today, so the assertions are exact without the
 * page needing a clock injection point.
 *
 *   node worker/tests/kpi_downtime.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import "./_kpi_core.mjs";            // sets globalThis.KPI for the slice below

const page = await readFile(new URL("../../kpis.html", import.meta.url), "utf8");

/* The derivations still live on the KPI page — they are what that page is for —
   while the spec and the day maths they read come from kpi-core.js. Everything
   from the thresholds through the derived-metric helpers. */
const from = page.indexOf("/* Thresholds and constants");
const to = page.indexOf("/* ---------- data loading");
assert.ok(from > 0 && to > from, "couldn't slice the derivation block out of kpis.html");

const src = [
  // What kpi-core.js puts in scope for the page (classic scripts share one
  // top-level scope), plus stand-ins for the browser bits the maths never calls.
  "const KPI = globalThis.KPI;",
  "const KPI_SPEC = KPI.SPEC;",
  "const KPI_KINDS = KPI.KINDS;",
  "const kindSpec = KPI.kindSpec;",
  "const TODAY = KPI.TODAY, TODAY_DN = KPI.TODAY_DN, dnum = KPI.dnum, dstr = KPI.dstr;",
  'const WORKER_URL = "";',
  "function nsGet(){ return null; } function nsSet(){} function nsDel(){}",
  "const document = { querySelector(){ return null; } };",
  page.slice(from, to),
  "export { statusSpans, timelineStats, downByMonth, monthlyCostOf, maintPerHour,",
  "  rentalMonthlyOf, monthList, monthStartDn, dnum, TODAY, TODAY_DN, DOWN_SET, TREND_MONTHS };",
].join("\n");
const M = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

const day = 86400000;
/** ISO date N days before today. */
const ago = n => new Date(Date.parse(M.TODAY + "T00:00:00Z") - n * day).toISOString().slice(0, 10);
const ev = (d, status, extra = {}) => ({ date: d, status, ...extra });

let checks = 0;
function ok(cond, msg){ assert.ok(cond, msg); checks++; }
function eq(a, b, msg){ assert.deepEqual(a, b, msg); checks++; }
function close(a, b, msg){ assert.ok(Math.abs(a - b) < 1e-6, msg + ` (got ${a}, want ${b})`); checks++; }

/* ---------- spans ---------- */
{
  const events = [ev(ago(30), "WK"), ev(ago(20), "DN"), ev(ago(10), "WK")];
  const s = M.statusSpans(events);
  eq(s.length, 3, "one span per event");
  eq(s.map(x => x.b - x.a), [10, 10, 10], "each span runs to the next event, the last to today");
  eq(s[2].closed, false, "the newest span is open");
  eq(s[0].closed, true, "earlier spans are closed");
}

/* ---------- a closed breakdown ---------- */
{
  const events = [ev(ago(100), "WK"), ev(ago(30), "DN", { remark: "hydraulic leak" }), ev(ago(20), "WK")];
  const st = M.timelineStats(events, null);
  eq(st.downDays, 10, "down from day-30 to day-20 is 10 days");
  eq(st.downEvents, 1, "one breakdown");
  eq(st.mttrDays, 10, "MTTR is the mean closed down span");
  eq(st.isDown, false, "it is working now");
  eq(st.observedDays, 100, "the whole history is observed");
  close(st.availPct, 90, "90% available");
  eq(st.longestDown, 10, "longest span");
  eq(st.arrived, ago(100), "arrival is the first event");
}

/* ---------- an open breakdown (still down today) ---------- */
{
  const events = [ev(ago(60), "WK"), ev(ago(5), "DS", { remark: "went to the vendor" })];
  const st = M.timelineStats(events, null);
  eq(st.downDays, 5, "an open span counts up to today");
  eq(st.isDown, true, "DS is a down status");
  eq(st.daysInState, 5, "days in the current state");
  eq(st.currentStatus, "DS");
  eq(st.mttrDays, null, "an unfinished repair has no repair time yet");
  eq(st.lastRemark, "went to the vendor", "the crew's note explains the current state");
  eq(st.downEvents, 1);
}

/* ---------- repeat breakdowns ---------- */
{
  const events = [
    ev(ago(120), "WK"),
    ev(ago(100), "DN"), ev(ago(93), "WK"),      // 7 days
    ev(ago(60), "DN"), ev(ago(57), "WK"),       // 3 days
    ev(ago(30), "DS"), ev(ago(10), "WK"),       // 20 days
  ];
  const st = M.timelineStats(events, null);
  eq(st.downDays, 30, "7 + 3 + 20");
  eq(st.downEvents, 3, "three breakdowns");
  close(st.mttrDays, 10, "mean of 7, 3, 20");
  eq(st.longestDown, 20);
  close(st.availPct, 100 * (120 - 30) / 120, "availability over the observed period");
}

/* ---------- an unknown state counts as neither up nor down ---------- */
{
  // The initial-load snapshot block collapses to this: an arrival with no status.
  // Counting it as downtime would invent months of it.
  const events = [ev(ago(90), "", { arrival: true }), ev(ago(30), "WK")];
  const st = M.timelineStats(events, null);
  eq(st.downDays, 0, "no downtime invented from a data gap");
  eq(st.observedDays, 30, "only the known-status period is observed");
  eq(st.availPct, 100);
}

/* ---------- missing / legal hold is excluded, not counted as downtime ---------- */
{
  const events = [ev(ago(50), "WK"), ev(ago(20), "MS")];
  const st = M.timelineStats(events, null);
  eq(st.downDays, 0, "a stolen unit is not a maintenance problem");
  eq(st.observedDays, 30, "its time is excluded from the availability base");
  eq(st.isDown, false);
  eq(st.availPct, 100, "availability is not dragged down by theft");
}

/* ---------- the rolling window clips spans, and only in-window breakdowns count ---------- */
{
  const windowFrom = M.monthStartDn(M.monthList(M.TREND_MONTHS)[0]);
  const daysInWindow = M.TODAY_DN - windowFrom;
  // Down since well before the window opened, and still down.
  const events = [ev(ago(daysInWindow + 200), "WK"), ev(ago(daysInWindow + 100), "DN")];
  const all = M.timelineStats(events, null);
  const win = M.timelineStats(events, windowFrom);
  eq(all.downDays, daysInWindow + 100, "unwindowed, the whole span counts");
  eq(win.downDays, daysInWindow, "windowed, only the in-window part counts");
  eq(win.downEvents, 0, "the breakdown started before the window, so it isn't counted as new");
  eq(win.isDown, true, "it is still down either way");
}

/* ---------- down days land in the right months ---------- */
{
  const months = M.monthList(M.TREND_MONTHS);
  const events = [ev(ago(400), "WK"), ev(ago(20), "DN"), ev(ago(5), "DS"), ev(ago(1), "WK")];
  const per = M.downByMonth(events, months);
  const total = months.reduce((s, m) => s + Object.values(per[m]).reduce((x, v) => x + v, 0), 0);
  eq(total, 19, "15 days DN + 4 days DS");
  const dn = months.reduce((s, m) => s + (per[m].DN || 0), 0);
  const ds = months.reduce((s, m) => s + (per[m].DS || 0), 0);
  eq(dn, 15, "DN days");
  eq(ds, 4, "DS days");
  ok(months.every(m => Object.values(per[m]).every(v => v >= 0)), "no negative buckets");
}
{
  // A span older than the window contributes nothing to the charted months.
  const months = M.monthList(M.TREND_MONTHS);
  const events = [ev(ago(900), "DN"), ev(ago(800), "WK")];
  const per = M.downByMonth(events, months);
  const total = months.reduce((s, m) => s + Object.values(per[m]).reduce((x, v) => x + v, 0), 0);
  eq(total, 0, "out-of-window downtime is not charted");
}

/* ---------- cost pickers ---------- */
{
  // Hourly units carry the monthly figure as Monthly Ownership, non-hourly as
  // Monthly Non-Hourly Ownership; Monthly Billing Rate is the unified column.
  eq(M.monthlyCostOf({ monthlyBillingRate: 7392, monthlyOwnership: 7392, monthlyNonHourlyOwnership: 0 }), 7392);
  eq(M.monthlyCostOf({ monthlyBillingRate: 0, monthlyNonHourlyOwnership: 1250 }), 1250);
  eq(M.monthlyCostOf({ monthlyBillingRate: 0 }), 0, "a genuine zero rate is not missing data");
  eq(M.monthlyCostOf({ rateGroup: "364" }), null, "no rate at all is null, not zero");
  eq(M.monthlyCostOf(null), null);
}
{
  close(M.maintPerHour({ pmComponent: 0.66, repairComponent: 2.59, tiresComponent: 1.5,
    oilComponent: 3.86, getComponent: 1.0 }), 9.61, "the maintenance allowance inside the hourly rate");
  eq(M.maintPerHour({ ownershipComponent: 42 }), null, "no maintenance components -> null");
}
{
  eq(M.rentalMonthlyOf({ totalNonHourlyRate: 1315 }), 1315, "the total wins when present");
  eq(M.rentalMonthlyOf({ monthlyNonHourlyRate: 125, bareRentalRate: 217 }), 342, "else the parts add up");
  eq(M.rentalMonthlyOf({ totalNonHourlyRate: 0, monthlyNonHourlyRate: 0, bareRentalRate: 0 }), null,
    "an all-zero rental is no commitment");
  eq(M.rentalMonthlyOf(null), null);
}

console.log(`kpi downtime maths: ${checks} assertions OK`);
