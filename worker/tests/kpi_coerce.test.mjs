/**
 * Coercion-parity tests for the KPI report adapters.
 *
 * kpi-core.js re-implements build/kpi_reports.py's coerce_num/coerce_int/coerce_date
 * so the browser importer and the Action build turn the same spreadsheet cell into
 * the same JSON value. The case table is shared: build/tests/test_build_kpis.py
 * asserts the Python side against it, this asserts the JS side, so changing one
 * port without the other fails CI.
 *
 * The functions are lifted straight out of the page (no build step in this repo)
 * and imported as a data: URL, the same trick teams.test.mjs uses.
 *
 *   node worker/tests/kpi_coerce.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { KPI } from "./_kpi_core.mjs";

const cases = JSON.parse(await readFile(new URL("../../build/tests/fixtures/kpi_coerce_cases.json", import.meta.url), "utf8"));

const { num: kpiNum, int: kpiInt, date: kpiDate } = KPI;

let n = 0;
for (const [raw, want] of cases.num){
  const got = kpiNum(raw);
  assert.strictEqual(got, want, `kpiNum(${JSON.stringify(raw)}) -> ${got}, want ${want}`);
  n++;
}
for (const [raw, want] of cases.int){
  const got = kpiInt(raw);
  assert.strictEqual(got, want, `kpiInt(${JSON.stringify(raw)}) -> ${got}, want ${want}`);
  n++;
}
for (const [raw, want] of cases.date){
  const got = kpiDate(raw);
  assert.strictEqual(got, want, `kpiDate(${JSON.stringify(raw)}) -> ${got}, want ${want}`);
  n++;
}

// -0 serializes as "-0" in JSON and would drift from Python's 0.0.
assert.strictEqual(JSON.stringify(kpiNum("-0")), "0");
assert.strictEqual(JSON.stringify(kpiNum("(0)")), "0");
n += 2;

console.log(`kpi coercion parity: ${n} cases OK`);
