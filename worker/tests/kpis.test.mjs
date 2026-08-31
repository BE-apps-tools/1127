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
    asOf: "2026-08-01", site: "36620001127", columns: [], ...extra };
}
const RATES = { monthlyBillingRate: 7392, hourlyBillingRate: 51.61, rateGroupDesc: "Whl Ldr LT 2 cu yards" };
const RENTAL = { vendor: "Warren CAT", po: "52120606", totalNonHourlyRate: 1315, billedThroughDate: "2026-09-14" };
const EVENTS = [
  { date: "2026-03-10", status: "DN", prev: "WK", remark: "Safety latch broken" },
  { date: "2026-03-13", status: "WK", prev: "DN", remark: "WK 3.13.26" },
];

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
  const { res } = await publish({ extracted: [{ report: report("rates"), units: { U1: RATES } }] }, { key: "wrong" });
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
    { report: report("rates"), units: { U1: RATES } },
    { report: report("rates"), units: { U2: RATES } },
  ] });
  assert.equal(res.status, 400, "two files of one family would silently overwrite");
  assert.match(json.error, /duplicate report kind/);
}
{
  const { res, json } = await publish({ extracted: [{ report: report("rental"), units: {} }] });
  assert.equal(res.status, 400); assert.match(json.error, /empty report/);
}
{
  // Values that aren't numbers, strings or the events array are dropped; a record
  // left with nothing is dropped too, and a report with no usable values is
  // refused rather than wiping the family it claims to replace.
  const { res, json } = await publish({ extracted: [{ report: report("rental"), units: { U1: { totalNonHourlyRate: { $: 1 }, other: [1] } } }] });
  assert.equal(res.status, 400); assert.match(json.error, /no usable values/);
}
{
  const bad = "U1\n<script>";
  const { res, json } = await publish({ extracted: [{ report: report("rental"), units: { [bad]: { totalNonHourlyRate: 1 } } }] });
  assert.equal(res.status, 400); assert.match(json.error, /bad unit key/);
}
{
  const { res } = await publish({ extracted: [{ report: report("rates"), units: { U1: { monthlyBillingRate: Infinity } } }] });
  assert.equal(res.status, 400, "non-finite numbers are not values");
}
{
  const { res, json } = await publish({ extracted: [{ report: report("rates"), units: { U1: RATES } }] }, { getStatus: 500 });
  assert.equal(res.status, 502, "a GitHub read failure must not be reported as success");
  assert.match(json.error, /github 500/);
}

/* ---------- first publish ---------- */
{
  const { res, json, committed, put } = await publish({ extracted: [
    { report: report("rates", { columns: ["monthlyBillingRate", "hourlyBillingRate"], units: 2 }),
      units: { U1: { ...RATES, serial: "S1" }, "SN:S3": { monthlyBillingRate: 125, serial: "S3" } } },
  ] });
  assert.equal(res.status, 200); assert.equal(json.ok, true);
  assert.deepEqual(json.kinds, ["rates"]);
  assert.equal(json.units, 2);
  assert.equal(put.body.sha, undefined, "no sha when the file didn't exist");
  assert.match(put.body.message, /Asset KPIs: rates \(2 units\) \[portal\]/);
  // The serial is lifted out of the family block so either key can join to the Master.
  assert.deepEqual(committed.units.U1, { serial: "S1", rates: RATES });
  assert.deepEqual(committed.units["SN:S3"], { serial: "S3", rates: { monthlyBillingRate: 125 } });
  assert.deepEqual(committed.reports.map(r => r.kind), ["rates"]);
  assert.equal(committed.reports[0].site, "36620001127", "the stamped site survives");
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(committed.builtAt));
}

/* ---------- the transfers family carries an events array ---------- */
{
  const { res, committed } = await publish({ extracted: [
    { report: report("transfers", { rows: 2 }),
      units: { U1: { events: EVENTS, eqClass: "Pile Driver" } } },
  ] });
  assert.equal(res.status, 200);
  assert.deepEqual(committed.units.U1.transfers.events, EVENTS, "the timeline is stored as sent");
  assert.equal(committed.units.U1.transfers.eqClass, "Pile Driver");
}
{
  // Events are sanitised: undated entries and junk drop out, order is normalised,
  // remarks are trimmed, and a missing status becomes '' (state unknown) rather
  // than being guessed at.
  const { committed } = await publish({ extracted: [
    { report: report("transfers"), units: { U1: { events: [
      { date: "2026-03-13", status: "WK" },
      { date: "not-a-date", status: "DN" },
      "junk",
      { status: "DN" },
      { date: "2026-03-10", status: "DN", remark: "x".repeat(400), bogus: { a: 1 } },
      { date: "2026-01-01", arrival: true },
    ] } } },
  ] });
  const ev = committed.units.U1.transfers.events;
  assert.equal(ev.length, 3, "only dated entries survive");
  assert.deepEqual(ev.map(e => e.date), ["2026-01-01", "2026-03-10", "2026-03-13"], "sorted oldest first");
  assert.equal(ev[0].status, "", "no status means state unknown");
  assert.equal(ev[0].arrival, true);
  assert.equal(ev[1].remark.length, 140, "remark trimmed");
  assert.equal(ev[1].bogus, undefined, "unknown keys dropped");
}
{
  const many = Array.from({ length: 700 }, (_, i) => ({ date: "2026-01-01", status: "WK", n: i }));
  const { committed } = await publish({ extracted: [
    { report: report("transfers"), units: { U1: { events: many } } },
  ] });
  assert.equal(committed.units.U1.transfers.events.length, 500, "event count is capped");
}

/* ---------- merge: one family at a time ---------- */
const EXISTING = {
  builtAt: "2026-08-01T00:00:00Z",
  reports: [report("rates", { file: "old-rates.xlsx" }), report("rental", { file: "anniversary.xlsx" })],
  units: {
    U1: { serial: "S1", rates: { monthlyBillingRate: 100 }, rental: RENTAL },
    U9: { rates: { monthlyBillingRate: 7 } },
  },
};
{
  const { committed, json } = await publish({ extracted: [
    { report: report("rates", { file: "new-rates.xlsx" }), units: { U1: { monthlyBillingRate: 7392 } } },
  ] }, { existing: EXISTING });
  assert.equal(committed.units.U1.rental.vendor, "Warren CAT", "rental must survive a rates import");
  assert.equal(committed.units.U1.rates.monthlyBillingRate, 7392, "rates is replaced");
  assert.equal(committed.units.U1.serial, "S1", "the known serial is kept");
  assert.equal(committed.units.U9, undefined, "a unit the new report drops has no data left");
  assert.equal(committed.reports.length, 2, "the report entry is replaced, not appended");
  assert.equal(committed.reports.find(r => r.kind === "rates").file, "new-rates.xlsx");
  assert.equal(json.units, 1);
}
{
  // A transfers import touches neither of the other families.
  const { committed } = await publish({ extracted: [
    { report: report("transfers"), units: { U1: { events: EVENTS } } },
  ] }, { existing: EXISTING });
  assert.equal(committed.units.U1.rates.monthlyBillingRate, 100);
  assert.equal(committed.units.U1.rental.vendor, "Warren CAT");
  assert.equal(committed.units.U1.transfers.events.length, 2);
  assert.equal(committed.units.U9.rates.monthlyBillingRate, 7, "untouched families keep their units");
  assert.deepEqual(committed.reports.map(r => r.kind), ["rates", "rental", "transfers"],
    "reports stay in spec order");
}
{
  // An unparseable committed file must not block the import.
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const m = init.method || "GET";
    calls.push({ url: String(url), method: m, body: init.body ? JSON.parse(init.body) : null });
    if (m === "GET") return new Response(JSON.stringify({ sha: "s", content: b64("{not json") }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const res = await worker.fetch(new Request("https://w.example/kpis", {
    method: "POST", headers: { "x-admin-key": "ak", "content-type": "application/json" },
    body: JSON.stringify({ extracted: [{ report: report("rental"), units: { U1: RENTAL } }] }),
  }), ENV, {});
  assert.equal(res.status, 200);
  const put = calls.find(c => c.method === "PUT");
  assert.equal(put.body.sha, "s", "still updates in place (sha kept) rather than 409-ing");
}
{
  const { res, json } = await publish({ extracted: [{ report: report("rental"), units: { U1: RENTAL } }] }, { putStatus: 409 });
  assert.equal(res.status, 502); assert.match(json.error, /github 409/);
}
{
  // A long string field is trimmed, not rejected.
  const { committed } = await publish({ extracted: [
    { report: report("rental"), units: { U1: { vendor: "v".repeat(400), totalNonHourlyRate: 1 } } },
  ] });
  assert.equal(committed.units.U1.rental.vendor.length, 140);
}

console.log("worker /kpis: all assertions OK");
