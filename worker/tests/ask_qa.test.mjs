/**
 * The canned Q&A — answers the page writes itself, with no model involved.
 *
 * These answers go in front of a manager, so the bar is the same as for a tile:
 * every figure has to come from deriveKpi(), and it has to be impossible for one
 * to come out as "NaN", "undefined" or a bare em-dash. A wrong number is worse
 * than no answer, and a mangled one destroys trust in the rest of the page.
 *
 * The other property held here: the catalogue never offers a question whose
 * answer would be "that report isn't loaded". If the data isn't there, the
 * question isn't on the list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATE, DERIVE, deriveKpi, askCatalogue,
  qaWorking, qaMeaning, qaFreshness, qaDownNow, qaWhereMoney, qaHowBusy, qaScope,
  qaChargeModel, FILTER,
} from "./_kpi_ask.mjs";

/* Same fleet shape as buildRows() produces. */
function row(o) {
  const flat = o.billing === "Non Hourly";
  const dd = o.downDays || 0;
  const st = o.tracked === false ? null
    : { observedDays: o.observed == null ? 365 : o.observed, downDays: dd,
        downEvents: o.downEvents || 0, isDown: !!o.down,
        currentStatus: o.curStatus || (o.down ? "DN" : "WK01"),
        mttrDays: o.mttr == null ? null : o.mttr, daysInState: o.daysInState || 1 };
  const hs = o.hours == null ? null
    : { total: o.hours, thisMonth: 0, perMonth: 0, days: o.hourDays || 0, months: o.hourMonths || 1 };
  const kpi = {};
  if (o.monthly != null) kpi.rates = {};
  if (st) kpi.transfers = {};
  if (o.damage != null) kpi.damage = {};
  if (hs) kpi.hours = {};
  if (o.util != null) kpi.utilization = {};
  if (o.rented) kpi.rental = {};
  return {
    unit: o.unit, serial: "", description: o.desc || ("Machine " + o.unit),
    description2: "", status: o.status || (o.down ? "DN" : "WK01"),
    trade: o.trade || "", eqClass: "", assigned: "",
    billingType: o.billing || "", chargeRunsWhileIdle: flat, kpi,
    st, hs, rt: o.monthly == null ? null : {}, hr: hs ? {} : null,
    downDays: st ? dd : null, downEvents: st ? (o.downEvents || 0) : null,
    mttrDays: st ? (o.mttr == null ? null : o.mttr) : null,
    isDown: st ? !!o.down : false, daysInState: st ? (o.daysInState || 1) : null,
    curStatus: st ? st.currentStatus : "", arrived: "2025-01-01",
    monthlyCost: o.monthly == null ? null : o.monthly,
    yearlyCost: o.monthly == null ? null : o.monthly * 12,
    hourlyRate: o.hourly == null ? null : o.hourly, maintPerHour: null,
    rentalMonthly: o.rental == null ? null : o.rental,
    vendor: o.vendor || "", annivDays: null, isRented: !!o.rented,
    damageCost: o.damage == null ? null : o.damage,
    damageIncidents: o.incidents == null ? null : o.incidents,
    damageLines: null, damageLast: "", damageShare: null,
    downCost: (o.monthly != null && st && dd && flat) ? (o.monthly / 30.44) * dd : null,
    utilAvg: o.util == null ? null : o.util, utilWeeks: o.utilWeeks == null ? null : o.utilWeeks,
    utilLast: null, utilReportStatus: "",
    hoursTotal: hs ? hs.total : null, hoursThisMonth: 0,
    hoursPerMonth: null, hoursDays: hs ? hs.days : null,
    costPerHour: (hs && hs.total > 0 && o.monthly != null && hs.months > 0)
      ? (o.monthly * hs.months) / hs.total : null,
    daysOnSite: o.daysOnSite == null ? 200 : o.daysOnSite,
    utilPct: null, hasKpi: true,
  };
}

function loadFleet() {
  STATE.rows = [
    row({ unit: "F1", billing: "Non Hourly", monthly: 3044, downDays: 10, downEvents: 2,
          mttr: 5, down: true, curStatus: "DN", daysInState: 4, damage: 1200, incidents: 1,
          util: 40, utilWeeks: 8, hours: 300, hourMonths: 3, hourDays: 40,
          trade: "Civil", desc: 'Lawn Mower Hustler 104"' }),
    row({ unit: "F2", billing: "Non Hourly", monthly: 6088, downDays: 20, downEvents: 4,
          mttr: 5, observed: 90, trade: "Civil", desc: "Pickup Ford F250" }),
    row({ unit: "H1", billing: "Hourly", monthly: 10000, hourly: 74.43, downDays: 30,
          downEvents: 3, mttr: 10, down: true, curStatus: "DS", daysInState: 12,
          trade: "Foundation", desc: "Pile Driver Vermeer PD25" }),
    row({ unit: "W1", billing: "Non Hourly", monthly: 1000, util: 12, utilWeeks: 4,
          trade: "Electrical", desc: "Telehandler CAT TL1255" }),
  ];
  STATE.kpis = { reports: [
    { kind: "rates", label: "Equipment Rates", importedAt: "2026-09-08T06:00:00Z" },
    { kind: "transfers", label: "Equipment Transfer", importedAt: "2026-09-08T06:00:00Z" },
    { kind: "damage", label: "Damage Expenses", importedAt: "2026-09-08T06:00:00Z" },
    { kind: "utilization", label: "Equipment Utilization", importedAt: "2026-09-08T06:00:00Z" },
    { kind: "hours", label: "Equipment Hours", importedAt: "2026-09-08T06:00:00Z" },
  ], units: {} };
  STATE.drill = null;
}

/* The single most important assertion in this file. An answer that reads
   "$NaN a month across undefined units" is worse than no feature. */
function assertClean(text, where) {
  assert.equal(typeof text, "string", where);
  assert.ok(text.trim().length > 40, where + ": barely an answer — " + JSON.stringify(text));
  for (const bad of ["NaN", "undefined", "null", "Infinity", "[object"]) {
    assert.ok(!text.includes(bad), where + ' leaked "' + bad + '": ' + text.slice(0, 220));
  }
  // An em-dash is fine in prose but never as a value: "is —" means a formatter
  // was handed nothing.
  assert.ok(!/\bis —/.test(text), where + " states a missing value as a dash: " + text.slice(0, 220));
  // Unbalanced bold markers render as literal asterisks in the panel.
  assert.equal((text.match(/\*\*/g) || []).length % 2, 0, where + " has an unclosed ** marker");
  // askFormat only understands **bold**; a lone asterisk reaches the reader as
  // an asterisk, which looks like a typo in the middle of a money figure.
  assert.ok(!/(^|[^*])\*([^*]|$)/.test(text.replace(/\*\*/g, "")),
    where + " has a stray single asterisk: " + text.slice(0, 220));
}

test("every question in the catalogue answers cleanly", () => {
  loadFleet();
  const cat = askCatalogue();
  assert.ok(cat.length > 10, "only " + cat.length + " questions");
  for (const e of cat) {
    assert.ok(e.q && e.q.length > 12, "thin question: " + e.q);
    assert.ok(e.q.endsWith("?"), "not phrased as a question: " + e.q);
    assert.equal(typeof e.a, "function", e.q);
    assertClean(e.a(), e.q);
  }
});

test("the catalogue never asks about a report that is not loaded", () => {
  loadFleet();
  // No rental report in this fleet, so no rental questions should be offered.
  const qs = askCatalogue().map(e => e.q.toLowerCase());
  assert.ok(!qs.some(q => q.includes("rental commitment")),
    "offered a rental question with no rental report: " + qs.join(" | "));
  // And every per-KPI question names a KPI that actually has data.
  for (const id of Object.keys(DERIVE)) {
    const m = deriveKpi(id, STATE.rows);
    const label = id.replace(/-/g, " ");
    const offered = qs.some(q => q.includes(label));
    if (!m || !m.inCount) assert.ok(!offered, "offered a question for empty KPI " + id);
  }
});

test("the working answer quotes the same figure as the ledger", () => {
  loadFleet();
  const m = deriveKpi("cost-while-down", STATE.rows);
  const text = qaWorking("cost-while-down");
  assertClean(text, "cost-while-down working");
  assert.ok(text.includes("$5,000"), "missing the total: " + text);
  assert.equal(m.total, 5000);
  // The population, the driver, and the exclusion with its price tag.
  assert.ok(/2 units/.test(text), "missing the population: " + text);
  assert.ok(text.includes("F2"), "missing the biggest contributor: " + text);
  assert.ok(text.includes("80.0%"), "missing its share: " + text);
  assert.ok(/billed hourly/.test(text), "missing the hourly exclusion: " + text);
  assert.ok(text.includes("$9,855"), "missing what the exclusion would have added: " + text);
  // And it points at where the full arithmetic lives.
  assert.ok(/tile above/.test(text), "does not point at the working panel");
});

test("a mean and a ratio are described as what they are, not as sums", () => {
  loadFleet();
  const mean = qaWorking("utilization");
  assertClean(mean, "utilization working");
  assert.ok(/counts once/.test(mean), "a mean must say each unit counts once: " + mean);

  const ratio = qaWorking("fleet-availability");
  assertClean(ratio, "availability working");
  assert.ok(/ratio of the totals/.test(ratio), "a ratio must say so: " + ratio);
});

test("what-does-it-mean carries the definition and the denominator", () => {
  loadFleet();
  const text = qaMeaning("cost-while-down");
  assertClean(text, "meaning");
  assert.ok(text.length > 200, "too thin to explain anything");
  assert.ok(/2 units/.test(text), "missing the population: " + text);
  assert.ok(/whole fleet/.test(text), "must warn when it covers only part of the fleet");
});

test("the standing questions answer from real numbers", () => {
  loadFleet();
  const down = qaDownNow();
  assertClean(down, "down now");
  assert.ok(/2 units/.test(down), down);
  assert.ok(/1 down on site, 1 in the shop/.test(down), down);
  assert.ok(down.includes("$3,044"), "missing the flat-rate burn: " + down);
  assert.ok(/bill by the hour/.test(down), "must explain the hourly unit charging nothing: " + down);

  const money = qaWhereMoney();
  assertClean(money, "where money");
  assert.ok(money.includes("$20,132"), "missing monthly total: " + money);
  assert.ok(/committed run-rate/.test(money), "must qualify the run-rate: " + money);

  const busy = qaHowBusy();
  assertClean(busy, "how busy");
  assert.ok(/parked machine is available/.test(busy),
    "availability vs utilization is the point of this answer: " + busy);

  assertClean(qaFreshness(), "freshness");
  assert.ok(/not imported/.test(qaFreshness()), "must name the missing report");
});

test("the scope answer says when the tiles are not covering the site", () => {
  loadFleet();
  assert.ok(/Nothing is filtered/.test(qaScope()));
  STATE.drill = "cost-while-down";
  const text = qaScope();
  assertClean(text, "scope drilled");
  assert.ok(/drilled into/.test(text), text);
  STATE.drill = null;
});

test("an empty site answers rather than throwing or lying", () => {
  STATE.rows = [];
  STATE.kpis = { reports: [], units: {} };
  STATE.drill = null;
  // No data means no per-KPI questions, but the standing ones still answer.
  const cat = askCatalogue();
  assert.ok(cat.length >= 5, "the standing questions should survive an empty site");
  for (const e of cat) assert.doesNotThrow(() => e.a(), e.q);
  const nd = qaWorking("cost-while-down");
  assert.ok(/not been imported/.test(nd), nd);
  assert.ok(/How current is this data/.test(nd), "should point at the coverage answer");
});

test("the charge-model answer describes the site, not the slice you are viewing", () => {
  loadFleet();
  // Both models named, with their real counts.
  const all = qaChargeModel();
  assertClean(all, "charge model");
  assert.ok(/Hourly — 1 unit\b/.test(all), all);
  assert.ok(/Non-hourly — 3 units/.test(all), all);
  assert.ok(/flat fee every month/.test(all), "must state the non-hourly rule: " + all);
  assert.ok(/Hours coded daily/.test(all), "must state the hourly rule: " + all);

  // Filtering to one model must not make the answer claim the other is empty —
  // it explains the models, it does not report on the current scope.
  FILTER.billing = "Hourly";
  try {
    const filtered = qaChargeModel();
    assertClean(filtered, "charge model, filtered");
    assert.ok(/Non-hourly — 3 units/.test(filtered),
      "an answer about both models must never report one of them as empty: " + filtered);
    assert.ok(/filtered to hourly units only/.test(filtered),
      "it should say the page is filtered, so the counts are not misread: " + filtered);
  } finally { FILTER.billing = ""; }
});

test("units with no billing type are named, not quietly folded into a model", () => {
  loadFleet();
  STATE.rows.push({ ...STATE.rows[0], unit: "Q1", billingType: "", chargeRunsWhileIdle: false });
  const text = qaChargeModel();
  assertClean(text, "charge model with an unclassified unit");
  assert.ok(/outside both models/.test(text),
    "a unit the rate report never classified must be called out: " + text);
});
