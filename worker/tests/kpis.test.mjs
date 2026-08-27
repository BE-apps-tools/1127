/**
 * Tests for the Worker's POST /kpis route (asset KPI report publish).
 *
 * Runs the real worker/src/index.js with fetch() stubbed, so the GitHub read and
 * the contents PUT are captured and asserted without touching the network. The
 * merge semantics here must match build/kpi_reports.py `merge` — one report
 * family replaced at a time, the others left alone — since the Action build and
 * this route both write data/kpis.json.
 *
 *   node worker/tests/kpis.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const src = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;

const ENV = { GH_TOKEN: "t", GH_REPO: "o/r", ADMIN_KEY: "ak", SUBMIT_KEY: "sk" };
const b64 = s => Buffer.from(s, "utf8").toString("base64");

function report(kind, extra = {}){
  return { kind, label: kind, file: kind + ".xlsx", rows: 1, units: 1,
    asOf: "2026-08-01", columns: [], ...extra };
}

/* POST /kpis with `existing` standing in for the committed data/kpis.json
   (null = the file doesn't exist yet). */
async function publish(body, { existing = null, key = "ak", putStatus = 200, getStatus = null } = {}){
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: (init.method || "GET"), body: init.body ? JSON.parse(init.body) : null });
    if (u.includes("/contents/data/kpis.json") && (init.method || "GET") === "GET"){
      if (getStatus) return new Response("nope", { status: getStatus });
      if (existing == null) return new Response("missing", { status: 404 });
      return new Response(JSON.stringify({ sha: "sha1", content: b64(JSON.stringify(existing)) }), { status: 200 });
    }
    if (u.includes("/contents/data/kpis.json")) return new Response(JSON.stringify({ commit: { sha: "c1" } }), { status: putStatus });
    return new Response("{}", { status: 200 });
  };
  const headers = { "content-type": "application/json" };
  if (key) headers["x-admin-key"] = key;
  const res = await worker.fetch(new Request("https://w.example/kpis", { method: "POST", headers, body: JSON.stringify(body) }), ENV, {});
  const json = await res.json().catch(() => ({}));
  const put = calls.find(c => c.method === "PUT");
  const committed = put ? JSON.parse(Buffer.from(put.body.content, "base64").toString("utf8")) : null;
  return { res, json, calls, put, committed };
}

/* ---------- auth + validation ---------- */
{
  const { res, json } = await publish({ extracted: [] }, { key: "" });
  assert.equal(res.status, 401, "no key must be rejected");
  assert.match(json.error, /admin/);
}
{
  const { res } = await publish({ extracted: [{ report: report("utilization"), units: { U1: { meterHours: 1 } } }] }, { key: "wrong" });
  assert.equal(res.status, 401, "a bad key must be rejected");
}
{
  const { res, json } = await publish({ extracted: [] });
  assert.equal(res.status, 400); assert.match(json.error, /no reports/);
}
{
  const { res, json } = await publish({ extracted: [{ report: report("telemetry"), units: { U1: { x: 1 } } }] });
  assert.equal(res.status, 400, "unknown family rejected"); assert.match(json.error, /unknown report kind/);
}
{
  const { res, json } = await publish({ extracted: [
    { report: report("utilization"), units: { U1: { meterHours: 1 } } },
    { report: report("utilization"), units: { U2: { meterHours: 2 } } },
  ] });
  assert.equal(res.status, 400, "two files of one family would silently overwrite");
  assert.match(json.error, /duplicate report kind/);
}
{
  const { res, json } = await publish({ extracted: [{ report: report("cost"), units: {} }] });
  assert.equal(res.status, 400); assert.match(json.error, /empty report/);
}
{
  // Values that aren't numbers or strings are dropped; a record left with nothing
  // is dropped too, and a report with no usable values is refused rather than
  // wiping the family it claims to replace.
  const { res, json } = await publish({ extracted: [{ report: report("cost"), units: { U1: { monthlyCost: { $: 1 }, other: [1] } } }] });
  assert.equal(res.status, 400); assert.match(json.error, /no usable values/);
}
{
  const bad = "U1\n<script>";
  const { res, json } = await publish({ extracted: [{ report: report("cost"), units: { [bad]: { monthlyCost: 1 } } }] });
  assert.equal(res.status, 400); assert.match(json.error, /bad unit key/);
}
{
  const { res } = await publish({ extracted: [{ report: report("cost"), units: { U1: { monthlyCost: Infinity } } }] });
  assert.equal(res.status, 400, "non-finite numbers are not values");
}
{
  const { res, json } = await publish({ extracted: [{ report: report("cost"), units: { U1: { monthlyCost: 1 } } }] }, { getStatus: 500 });
  assert.equal(res.status, 502, "a GitHub read failure must not be reported as success");
  assert.match(json.error, /github 500/);
}

/* ---------- first publish ---------- */
{
  const { res, json, committed, put } = await publish({ extracted: [
    { report: report("utilization", { columns: ["meterHours", "idleHours"] }),
      units: { U1: { meterHours: 5200, idleHours: 300, serial: "S1" }, "SN:S3": { meterHours: 120, serial: "S3" } } },
  ] });
  assert.equal(res.status, 200); assert.equal(json.ok, true);
  assert.deepEqual(json.kinds, ["utilization"]);
  assert.equal(json.units, 2);
  assert.equal(put.body.sha, undefined, "no sha when the file didn't exist");
  assert.match(put.body.message, /Asset KPIs: utilization \(2 units\) \[portal\]/);
  // The serial is lifted out of the family block so either key can join to the Master.
  assert.deepEqual(committed.units.U1, { serial: "S1", utilization: { meterHours: 5200, idleHours: 300 } });
  assert.deepEqual(committed.units["SN:S3"], { serial: "S3", utilization: { meterHours: 120 } });
  assert.deepEqual(committed.reports.map(r => r.kind), ["utilization"]);
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(committed.builtAt));
}

/* ---------- merge: one family at a time ---------- */
const EXISTING = {
  builtAt: "2026-08-01T00:00:00Z",
  reports: [report("utilization", { file: "old-util.xlsx" }), report("cost", { file: "cost.xlsx" })],
  units: {
    U1: { serial: "S1", utilization: { meterHours: 100 }, cost: { monthlyCost: 4200 } },
    U9: { utilization: { meterHours: 7 } },
  },
};
{
  const { committed, json } = await publish({ extracted: [
    { report: report("utilization", { file: "new-util.xlsx" }), units: { U1: { meterHours: 5200 } } },
  ] }, { existing: EXISTING });
  assert.equal(committed.units.U1.cost.monthlyCost, 4200, "cost must survive a utilization import");
  assert.equal(committed.units.U1.utilization.meterHours, 5200, "utilization is replaced");
  assert.equal(committed.units.U1.serial, "S1", "the known serial is kept");
  assert.equal(committed.units.U9, undefined, "a unit the new report drops has no data left");
  assert.equal(committed.reports.length, 2, "the report entry is replaced, not appended");
  assert.equal(committed.reports.find(r => r.kind === "utilization").file, "new-util.xlsx");
  assert.equal(json.units, 1);
}
{
  // A maintenance import touches neither of the other two families.
  const { committed } = await publish({ extracted: [
    { report: report("maintenance"), units: { U1: { openWo: 2, pmDueDate: "2026-09-15" } } },
  ] }, { existing: EXISTING });
  assert.equal(committed.units.U1.utilization.meterHours, 100);
  assert.equal(committed.units.U1.cost.monthlyCost, 4200);
  assert.equal(committed.units.U1.maintenance.openWo, 2);
  assert.equal(committed.units.U9.utilization.meterHours, 7, "untouched families keep their units");
  assert.deepEqual(committed.reports.map(r => r.kind), ["utilization", "maintenance", "cost"],
    "reports stay in spec order");
}
{
  // An unparseable committed file must not block the import.
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    calls.push({ url: u, method: m, body: init.body ? JSON.parse(init.body) : null });
    if (m === "GET") return new Response(JSON.stringify({ sha: "s", content: b64("{not json") }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const res = await worker.fetch(new Request("https://w.example/kpis", {
    method: "POST", headers: { "x-admin-key": "ak", "content-type": "application/json" },
    body: JSON.stringify({ extracted: [{ report: report("cost"), units: { U1: { monthlyCost: 1 } } }] }),
  }), ENV, {});
  assert.equal(res.status, 200);
  const put = calls.find(c => c.method === "PUT");
  assert.equal(put.body.sha, "s", "still updates in place (sha kept) rather than 409-ing");
}
{
  const { res, json } = await publish({ extracted: [{ report: report("cost"), units: { U1: { monthlyCost: 1 } } }] }, { putStatus: 409 });
  assert.equal(res.status, 502); assert.match(json.error, /github 409/);
}
{
  // A long string field is trimmed, not rejected.
  const { committed } = await publish({ extracted: [
    { report: report("cost"), units: { U1: { vendor: "v".repeat(400), monthlyCost: 1 } } },
  ] });
  assert.equal(committed.units.U1.cost.vendor.length, 120);
}

console.log("worker /kpis: all assertions OK");
