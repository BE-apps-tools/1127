/**
 * Coalescing two files of one family, held to the Python port.
 *
 * The Anniversary Date export is run once per billing type — one file for the
 * hourly units, one for the non-hourly — so two files of one family is the
 * normal case, not an edge case. Handed straight to merge() the second destroys
 * the first, because merge drops a family from every unit before applying an
 * entry: the hourly rentals vanished and nothing said so.
 *
 * Both ports have to fold them identically or the browser preview and the Action
 * build produce different data from the same two files.
 * build/tests/test_build_kpis.py holds the Python side of this contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { KPI } from "./_kpi_core.mjs";

const entry = (kind, units, file, o = {}) => ({
  units: { ...units },
  report: { kind, label: kind, file, rows: o.rows || 0, units: Object.keys(units).length,
            asOf: o.asOf || "", site: o.site || "", columns: o.columns || [] },
});

test("two slices of one report are unioned, not left to destroy each other", () => {
  const a = entry("rental", { U1: { billingType: "Hourly" }, U2: { billingType: "Hourly" } },
    "Anniversary_Date_9.xlsx", { rows: 2, asOf: "2026-09-01", site: "36620001127", columns: ["vendor", "hourlyRate"] });
  const b = entry("rental", { U3: { billingType: "Non Hourly" } },
    "Anniversary_Date_10.xlsx", { rows: 1, asOf: "2026-09-05", site: "36620001127", columns: ["vendor", "totalNonHourlyRate"] });

  const { entries, conflicts } = KPI.coalesce([a, b]);
  assert.deepEqual(conflicts, []);
  assert.equal(entries.length, 1);
  const rep = entries[0].report;
  assert.deepEqual(Object.keys(entries[0].units).sort(), ["U1", "U2", "U3"]);
  assert.equal(rep.units, 3);
  assert.equal(rep.rows, 3);
  assert.equal(rep.asOf, "2026-09-05");
  assert.equal(rep.site, "36620001127");
  assert.deepEqual(rep.columns, ["hourlyRate", "totalNonHourlyRate", "vendor"]);

  // The point of it: both billing types survive the merge.
  const merged = KPI.merge({ builtAt: "", reports: [], units: {} }, entries);
  assert.deepEqual(Object.keys(merged.units).sort(), ["U1", "U2", "U3"]);
  // Straight to merge, the hourly pair is silently gone.
  const naive = KPI.merge({ builtAt: "", reports: [], units: {} }, [a, b]);
  assert.deepEqual(Object.keys(naive.units), ["U3"]);
});

test("two vintages of one report are refused rather than guessed at", () => {
  const a = entry("rental", { U1: { vendor: "old" }, U2: {} }, "Anniversary_Date_9.xlsx");
  const b = entry("rental", { U1: { vendor: "new" } }, "Anniversary_Date_9 (1).xlsx");
  const { entries, conflicts } = KPI.coalesce([a, b]);
  assert.deepEqual(entries, []);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].kind, "rental");
  assert.equal(conflicts[0].units, 1);
  assert.deepEqual(conflicts[0].examples, ["U1"]);
});

test("a conflict in one family does not take the others down with it", () => {
  const r = entry("rates", { U1: {} }, "rates.xlsx");
  const b = entry("rental", { U2: {} }, "b.xlsx");
  const c = entry("rental", { U2: {} }, "c.xlsx");
  const t = entry("transfers", { U9: {} }, "t.xlsx");
  const { entries, conflicts } = KPI.coalesce([r, b, c, t]);
  assert.deepEqual(entries.map(e => e.report.kind), ["rates", "transfers"]);
  assert.deepEqual(conflicts.map(x => x.kind), ["rental"]);
});

test("coalesce does not mutate what it was given", () => {
  const a = entry("rental", { U1: {} }, "a.xlsx", { rows: 1 });
  const b = entry("rental", { U2: {} }, "b.xlsx", { rows: 1 });
  KPI.coalesce([a, b]);
  assert.deepEqual(Object.keys(a.units), ["U1"]);
  assert.equal(a.report.rows, 1);
  assert.equal(a.report.file, "a.xlsx");
});

test("a mismatched site blanks rather than picking one", () => {
  const a = entry("rental", { U1: {} }, "a.xlsx", { site: "36620001127" });
  const b = entry("rental", { U2: {} }, "b.xlsx", { site: "99900002222" });
  const { entries } = KPI.coalesce([a, b]);
  assert.equal(entries[0].report.site, "");
});
