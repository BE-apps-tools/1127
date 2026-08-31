/**
 * Merge parity: the in-page preview vs the Worker's real publish.
 *
 * `kpiMerge` in kpis.html applies parsed reports to the page in memory so an
 * admin can check the numbers before publishing. If it merged differently from
 * the Worker, the preview would show figures the publish wouldn't produce —
 * which is worse than having no preview at all.
 *
 * So this feeds the SAME extracted payload to both and asserts the resulting
 * units and reports are identical. (build/tests/test_build_kpis.py holds the
 * Python side of the same contract.)
 *
 *   node worker/tests/kpi_merge.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const page = await readFile(new URL("../../kpis.html", import.meta.url), "utf8");
const src = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;

/* Lift kpiMerge (and the kind list it orders by) out of the page. */
const specMatch = /const KPI_SPEC = (\{.*?\});/s.exec(page);
const from = page.indexOf("function kpiMerge(bundle, extracted){");
const to = page.indexOf("function rerenderAll()");
assert.ok(specMatch && from > 0 && to > from, "couldn't slice kpiMerge out of kpis.html");
const mod = await import("data:text/javascript;base64," + Buffer.from([
  "const KPI_SPEC = " + specMatch[1] + ";",
  "const KPI_KINDS = KPI_SPEC.kinds.map(k => k.kind);",
  page.slice(from, to),
  "export { kpiMerge, KPI_KINDS };",
].join("\n")).toString("base64"));
const { kpiMerge } = mod;

const ENV = { GH_TOKEN: "t", GH_REPO: "o/r", ADMIN_KEY: "ak" };
const b64 = s => Buffer.from(s, "utf8").toString("base64");

/** Publish `extracted` through the real Worker on top of `existing`. */
async function viaWorker(existing, extracted){
  let committed = null;
  globalThis.fetch = async (url, init = {}) => {
    const m = init.method || "GET";
    if (m === "GET"){
      if (existing == null) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ sha: "s", content: b64(JSON.stringify(existing)) }), { status: 200 });
    }
    committed = JSON.parse(Buffer.from(JSON.parse(init.body).content, "base64").toString("utf8"));
    return new Response("{}", { status: 200 });
  };
  const res = await worker.fetch(new Request("https://w.example/kpis", {
    method: "POST", headers: { "x-admin-key": "ak", "content-type": "application/json" },
    body: JSON.stringify({ extracted }),
  }), ENV, {});
  assert.equal(res.status, 200, "worker publish should succeed for these fixtures");
  return committed;
}

/* importedAt is deliberately different: the Worker stamps it server-side at
   publish time, while a preview stamps "now" in the browser. Everything else
   about the reports must match exactly. */
const stripStamps = reports => reports.map(({ importedAt, preview, ...rest }) => rest);

async function assertParity(label, existing, extracted){
  const fromWorker = await viaWorker(existing, extracted);
  const fromPreview = kpiMerge(existing, extracted);
  assert.deepEqual(fromPreview.units, fromWorker.units, label + ": units differ");
  assert.deepEqual(stripStamps(fromPreview.reports), stripStamps(fromWorker.reports),
    label + ": reports differ");
  // Only the families in this payload get a fresh stamp. A family carried over
  // untouched keeps its original importedAt — that is what lets it go stale and
  // get picked up by the daily freshness check.
  const published = new Set(extracted.map(e => e.report.kind));
  for (const r of fromWorker.reports){
    if (published.has(r.kind)){
      assert.ok(r.importedAt, `${label}: ${r.kind} was published, so it must be stamped`);
    }
  }
  return { fromWorker, fromPreview };
}

const report = (kind, extra = {}) => ({ kind, label: kind, file: kind + ".xlsx",
  rows: 1, units: 1, asOf: "2026-08-01", site: "36620001127", columns: [], ...extra });
const RATES = { monthlyBillingRate: 7392, hourlyBillingRate: 51.61 };
const RENTAL = { vendor: "Acme Equipment Co", totalNonHourlyRate: 1315, billedThroughDate: "2026-09-14" };
const EVENTS = [
  { date: "2026-03-10", status: "DN", prev: "WK", remark: "hydraulic leak" },
  { date: "2026-03-13", status: "WK", prev: "DN", remark: "repaired" },
];

let n = 0;

/* ---------- onto an empty bundle ---------- */
{
  await assertParity("first publish", null, [
    { report: report("rates"), units: { U1: { ...RATES, serial: "S1" } } },
  ]);
  n++;
}

/* ---------- one family replaced, the others untouched ---------- */
const EXISTING = {
  builtAt: "2026-08-01T00:00:00Z",
  reports: [report("rates", { file: "old-rates.xlsx" }), report("rental")],
  units: {
    U1: { serial: "S1", rates: { monthlyBillingRate: 100 }, rental: RENTAL },
    U9: { rates: { monthlyBillingRate: 7 } },
  },
};
{
  const { fromPreview } = await assertParity("rates replaced", EXISTING, [
    { report: report("rates", { file: "new-rates.xlsx" }), units: { U1: { monthlyBillingRate: 7392 } } },
  ]);
  assert.equal(fromPreview.units.U1.rental.vendor, "Acme Equipment Co", "rental survives");
  assert.equal(fromPreview.units.U9, undefined, "a unit the new report drops has no data left");
  n++;
}
{
  const { fromPreview } = await assertParity("transfers added", EXISTING, [
    { report: report("transfers", { rows: 2 }), units: { U1: { events: EVENTS, eqClass: "Excavator" } } },
  ]);
  assert.equal(fromPreview.units.U1.transfers.events.length, 2);
  assert.equal(fromPreview.units.U1.rates.monthlyBillingRate, 100, "rates untouched");
  assert.deepEqual(fromPreview.reports.map(r => r.kind), ["rates", "rental", "transfers"],
    "reports stay in spec order");
  n++;
}

/* ---------- several families at once, and the serial lift ---------- */
{
  const { fromPreview } = await assertParity("three at once", EXISTING, [
    { report: report("rates"), units: { U1: RATES } },
    { report: report("rental"), units: { U1: RENTAL } },
    { report: report("transfers"), units: { "SN:S3": { events: EVENTS, serial: "S3" } } },
  ]);
  assert.equal(fromPreview.units["SN:S3"].serial, "S3", "serial lifted out of the family block");
  assert.equal(fromPreview.units["SN:S3"].transfers.serial, undefined);
  n++;
}

/* ---------- the preview must not mutate the published bundle ---------- */
{
  const published = JSON.parse(JSON.stringify(EXISTING));
  const snapshot = JSON.stringify(published);
  kpiMerge(published, [{ report: report("rates"), units: { U1: { monthlyBillingRate: 1 } } }]);
  assert.equal(JSON.stringify(published), snapshot,
    "Discard must be able to restore the exact published bundle");
  n++;
}

/* ---------- preview keeps the published builtAt; the Worker restamps it ---------- */
{
  const preview = kpiMerge(EXISTING, [{ report: report("rates"), units: { U1: RATES } }]);
  assert.equal(preview.builtAt, EXISTING.builtAt,
    "an unpublished preview must not claim a new build time");
  const committed = await viaWorker(EXISTING, [{ report: report("rates"), units: { U1: RATES } }]);
  assert.ok(committed.builtAt > EXISTING.builtAt, "a real publish restamps builtAt");
  n++;
}

console.log(`kpi merge parity (page preview vs worker publish): ${n} scenarios OK`);
