/**
 * The working behind every KPI tile.
 *
 * A tile that reports $327K when the truth is $40K is worse than no tile, and the
 * only defence is that the page can show its arithmetic. These tests pin the two
 * properties that make the shown working trustworthy:
 *
 *   1. It reconciles — the ledger's total is the figure on the tile, and every
 *      unit in view is either counted or named in an exclusion, never dropped
 *      silently.
 *   2. It stays paired with the drill-downs — a tile that can be clicked but has
 *      no derivation would answer "which units" and still not answer "how".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRILLS, DERIVE, deriveKpi } from "./_kpi_work.mjs";

const DPM = 30.44;

/* A row shaped like buildRows() produces, with only the fields a KPI reads. */
function row(o) {
  const monthly = o.monthly == null ? null : o.monthly;
  const flat = o.billing === "Non Hourly";
  const downDays = o.downDays || 0;
  const st = o.tracked === false ? null
    : { observedDays: o.observed == null ? 365 : o.observed, downDays,
        downEvents: o.downEvents || 0, isDown: !!o.down,
        currentStatus: o.curStatus || (o.down ? "DN" : "WK01"),
        availPct: null, mttrDays: o.mttr == null ? null : o.mttr, daysInState: o.daysInState || 1 };
  const hs = o.hours == null ? null
    : { total: o.hours, thisMonth: 0, perMonth: 0, days: o.hourDays || 0, months: o.hourMonths || 1 };
  return {
    unit: o.unit, serial: "", description: o.desc || "Machine " + o.unit,
    status: o.status || (o.down ? "DN" : "WK01"),
    billingType: o.billing || "", chargeRunsWhileIdle: flat,
    st, hs, hr: hs ? {} : null, rt: monthly == null ? null : {},
    downDays: st ? downDays : null,
    downEvents: st ? (o.downEvents || 0) : null,
    mttrDays: st ? (o.mttr == null ? null : o.mttr) : null,
    isDown: st ? !!o.down : false,
    daysInState: st ? (o.daysInState || 1) : null,
    curStatus: st ? st.currentStatus : "",
    monthlyCost: monthly, yearlyCost: monthly == null ? null : monthly * 12,
    hourlyRate: o.hourly == null ? null : o.hourly,
    maintPerHour: null,
    rentalMonthly: o.rental == null ? null : o.rental,
    vendor: o.vendor || "", isRented: !!o.rented,
    damageCost: o.damage == null ? null : o.damage,
    damageIncidents: o.incidents == null ? null : o.incidents,
    damageLines: o.lines == null ? null : o.lines,
    downCost: (monthly != null && st && downDays && flat) ? (monthly / DPM) * downDays : null,
    utilAvg: o.util == null ? null : o.util,
    utilWeeks: o.utilWeeks == null ? null : o.utilWeeks,
    utilLast: null,
    hoursTotal: hs ? hs.total : null,
    hoursThisMonth: hs ? hs.thisMonth : null,
    hoursDays: hs ? hs.days : null,
    costPerHour: (hs && hs.total > 0 && monthly != null && hs.months > 0)
      ? (monthly * hs.months) / hs.total : null,
    daysOnSite: o.daysOnSite == null ? 200 : o.daysOnSite,
    utilPct: null,
    hasKpi: true,
  };
}

/* A fleet that hits every branch of every derivation at least once.
   The tracked windows are deliberately unequal — a fleet where every unit has
   been on site the same number of days cannot tell a ratio of totals apart from
   an average of percentages. */
function fleet() {
  const R = [
    // Flat-rate, down, priced — the population "cost while down" is made of.
    row({ unit: "F1", billing: "Non Hourly", monthly: 3044, downDays: 10, downEvents: 2,
          mttr: 5, down: true, curStatus: "DN", daysInState: 4, observed: 365,
          damage: 1200, incidents: 1, lines: 3,
          util: 40, utilWeeks: 8, hours: 300, hourMonths: 3, hourDays: 40, rented: true, rental: 2000 }),
    row({ unit: "F2", billing: "Non Hourly", monthly: 6088, downDays: 20, downEvents: 4,
          mttr: 5, observed: 90 }),
    // Hourly, real downtime, bills nothing while broken — the correction.
    row({ unit: "H1", billing: "Hourly", monthly: 10000, hourly: 74.43, downDays: 30,
          downEvents: 3, mttr: 10, down: true, curStatus: "DS", daysInState: 12, observed: 365 }),
    row({ unit: "H2", billing: "Hourly", monthly: 20000, hourly: 120, downDays: 15,
          downEvents: 1, mttr: 15, observed: 200 }),
    // Flat-rate and down, but nothing priced it.
    row({ unit: "N1", billing: "Non Hourly", monthly: null, downDays: 8, downEvents: 1,
          mttr: 8, observed: 30 }),
    // Healthy, never down.
    row({ unit: "W1", billing: "Non Hourly", monthly: 1000, util: 12, utilWeeks: 4, observed: 365 }),
    // No transfer history at all: no status, no downtime, no availability.
    row({ unit: "X1", billing: "Hourly", monthly: 500, hourly: 30, tracked: false, status: "WK01" }),
    // Rented but billed hourly — no monthly rate to total.
    row({ unit: "R1", billing: "Hourly", monthly: 800, hourly: 40, rented: true, rental: 0, observed: 60 }),
  ];
  R.forEach(r => {
    r.utilPct = (r.hs && r.hs.days != null && r.daysOnSite > 0)
      ? Math.min(100, 100 * r.hs.days / r.daysOnSite) : null;
  });
  return R;
}

test("every drill-down declares a derivation, and every derivation a drill-down", () => {
  assert.deepEqual(Object.keys(DERIVE).sort(), Object.keys(DRILLS).sort());
});

test("each derivation declares the pieces its own kind needs", () => {
  for (const [id, w] of Object.entries(DERIVE)) {
    assert.ok(w.eq, id + " has no formula");
    assert.ok(w.words && w.words.length > 40, id + " has no plain-English reading");
    assert.equal(typeof w.include, "function", id + " does not say who counts");
    assert.ok(Array.isArray(w.inputs), id + " declares no inputs");
    assert.ok(Array.isArray(w.drops), id + " declares no exclusions");
    assert.ok(["sum", "mean", "ratio", "count"].includes(w.kind), id + ": " + w.kind);
    if (w.kind === "sum" || w.kind === "mean") {
      assert.equal(typeof w.each, "function", id + " must say what one unit contributes");
    }
    if (w.kind === "ratio") {
      assert.equal(typeof w.num, "function", id + " needs a numerator");
      assert.equal(typeof w.den, "function", id + " needs a denominator");
    }
    // A count is one unit, one vote; anything per-unit would be ignored.
    if (w.kind === "count") assert.equal(w.each, undefined, id + " is a count, so `each` is dead code");
    w.inputs.forEach(i => {
      assert.ok(i.label, id + " has an unlabelled input");
      assert.equal(typeof i.get, "function", id + ": input " + i.label + " has no accessor");
    });
    w.drops.forEach(g => {
      assert.ok(g.why && g.why.length > 10, id + " has an exclusion with no reason");
      assert.equal(typeof g.match, "function", id + ": exclusion \"" + g.why + "\" has no predicate");
    });
  }
});

test("every unit in view is either counted or named in an exclusion", () => {
  const R = fleet();
  for (const id of Object.keys(DERIVE)) {
    const m = deriveKpi(id, R);
    assert.ok(m, id + " derived nothing");
    const out = m.drops.reduce((s, g) => s + g.n, 0);
    assert.equal(m.rows.length + out, R.length,
      id + ": " + m.rows.length + " counted + " + out + " excluded != " + R.length + " in view");
    assert.equal(m.inCount, m.rows.length, id);
    assert.equal(m.outCount, out, id + ": a unit is in two exclusion groups, or none");
  }
});

test("the running column lands exactly on the total", () => {
  const R = fleet();
  for (const id of Object.keys(DERIVE)) {
    const m = deriveKpi(id, R);
    if (!m.rows.length) continue;
    const last = m.rows[m.rows.length - 1].run;
    assert.ok(Math.abs(last - m.total) < 1e-9,
      id + ": running total ends at " + last + " but the tile says " + m.total);
  }
});

test("shares add up to the whole, for the tiles that have them", () => {
  const R = fleet();
  for (const id of Object.keys(DERIVE)) {
    const m = deriveKpi(id, R);
    if (m.kind !== "sum" && m.kind !== "count") {
      // An average or a ratio has no meaningful per-unit share of the headline.
      m.rows.forEach(r => assert.equal(r.share, null, id));
      continue;
    }
    if (!m.rows.length || !m.total) continue;
    const s = m.rows.reduce((t, r) => t + r.share, 0);
    assert.ok(Math.abs(s - 100) < 1e-6, id + ": shares sum to " + s + "%");
  }
});

test("cost while down prices only the units whose charge runs while idle", () => {
  const m = deriveKpi("cost-while-down", fleet());
  assert.deepEqual(m.rows.map(r => r.r.unit), ["F2", "F1"]);   // biggest contributor first
  // 6088/30.44*20 + 3044/30.44*10 = 4000 + 1000
  assert.ok(Math.abs(m.total - 5000) < 1e-6, "total was " + m.total);

  // The hourly units are excluded by name, and the ledger says what counting them
  // would have cost — which is the whole argument for excluding them.
  const hourly = m.drops.find(g => /billed hourly/.test(g.why));
  assert.ok(hourly, "no exclusion names the hourly units");
  assert.equal(hourly.n, 2);
  // 10000/30.44*30 + 20000/30.44*15 = 9855.45 + 9855.45
  assert.ok(Math.abs(hourly.would - 19710.90) < 0.05, "would have added " + hourly.would);
  assert.ok(hourly.would > 3 * m.total,
    "the excluded figure should dwarf the real one — that was the bug");

  const unpriced = m.drops.find(g => /no rate/.test(g.why));
  assert.equal(unpriced.n, 1, "the flat-rate unit with no rate must be named, not dropped");
});

test("spend on down units counts only what is still being billed today", () => {
  const m = deriveKpi("spend-on-down-units", fleet());
  assert.deepEqual(m.rows.map(r => r.r.unit), ["F1"]);
  assert.equal(m.total, 3044);
  const idle = m.drops.find(g => /no hours worked/.test(g.why));
  assert.equal(idle.n, 1);                     // H1 is down and hourly
  assert.equal(idle.would, 10000);             // what the old, wrong tile added
});

test("availability is a ratio of totals, not an average of percentages", () => {
  const R = fleet();
  const m = deriveKpi("fleet-availability", R);
  const tracked = R.filter(r => r.st);
  const obs = tracked.reduce((s, r) => s + r.st.observedDays, 0);
  const dd = tracked.reduce((s, r) => s + (r.downDays || 0), 0);
  assert.ok(Math.abs(m.total - 100 * (obs - dd) / obs) < 1e-9);
  // Averaging each unit's own percentage would give a different, flattering answer.
  const naive = tracked.reduce((s, r) =>
    s + 100 * (r.st.observedDays - (r.downDays || 0)) / r.st.observedDays, 0) / tracked.length;
  assert.notEqual(m.total.toFixed(4), naive.toFixed(4));
  assert.equal(m.drops.find(g => /no tracked days|transfer history/i.test(g.why)).n, 1);  // X1
});

test("a mean weights each unit once, however much it reported", () => {
  const m = deriveKpi("utilization", fleet());
  assert.equal(m.rows.length, 2);                 // F1 at 40% over 8 weeks, W1 at 12% over 4
  assert.ok(Math.abs(m.total - 26) < 1e-9, "was " + m.total);
  // 8 weeks of reporting does not outweigh 4: a week-weighted mean would be 30.7%.
  assert.notEqual(m.total.toFixed(4), ((40 * 8 + 12 * 4) / 12).toFixed(4));
  // Quietest first, because that is the order the tile ranks by.
  assert.equal(m.rows[0].r.unit, "W1");
  assert.equal(m.asc, true);
  // The running column is a running average, so it also ends on the headline.
  assert.equal(m.rows[0].run, 12);
  assert.equal(m.rows[1].run, 26);
});

test("cost per hour divides by the months a unit actually worked", () => {
  const m = deriveKpi("cost-per-hour-worked", fleet());
  assert.deepEqual(m.rows.map(r => r.r.unit), ["F1"]);
  // 3044 x 3 months / 300 h = $30.44/h, not 3044 x 12 / 300 = $121.76
  assert.ok(Math.abs(m.total - 30.44) < 1e-9, "was " + m.total);
});

test("a count contributes one per unit and nothing else", () => {
  const R = fleet();
  const m = deriveKpi("down-right-now", R);
  assert.equal(m.kind, "count");
  m.rows.forEach(r => assert.equal(r.v, 1));
  assert.equal(m.total, R.filter(r => r.isDown).length);
  assert.equal(m.total, 2);
  // The unit with no transfer history is excluded for that reason, not counted as up.
  assert.equal(m.drops.find(g => /no transfer history/i.test(g.why)).n, 1);
});

test("units on site excludes nobody, by design", () => {
  const R = fleet();
  const m = deriveKpi("units-on-site", R);
  assert.equal(m.total, R.length);
  assert.deepEqual(m.drops, []);
});

test("an empty scope derives a total of nothing rather than throwing", () => {
  for (const id of Object.keys(DERIVE)) {
    const m = deriveKpi(id, []);
    assert.ok(m, id);
    assert.equal(m.rows.length, 0, id);
    assert.equal(m.drops.length, 0, id);
    assert.ok(m.total === 0 || m.total === null, id + " totalled " + m.total);
  }
});

test("an unknown drill has no working, rather than a blank panel", () => {
  assert.equal(deriveKpi("no-such-tile", fleet()), null);
});
