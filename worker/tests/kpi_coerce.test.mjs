/**
 * Coercion-parity tests for the KPI report adapters.
 *
 * kpis.html re-implements build/kpi_reports.py's coerce_num/coerce_int/coerce_date
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

const page = await readFile(new URL("../../kpis.html", import.meta.url), "utf8");
const cases = JSON.parse(await readFile(new URL("../../build/tests/fixtures/kpi_coerce_cases.json", import.meta.url), "utf8"));

const start = page.indexOf("function kpiNum(");
const endMark = "const KPI_COERCE=";
const end = page.indexOf(endMark);
assert.ok(start > 0 && end > start, "couldn't find the coercion block in kpis.html");
const src = page.slice(start, end) + "\nexport { kpiNum, kpiInt, kpiDate };\n";
const { kpiNum, kpiInt, kpiDate } = await import(
  "data:text/javascript;base64," + Buffer.from(src).toString("base64"));

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
