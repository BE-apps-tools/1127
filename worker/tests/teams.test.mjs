/**
 * Teams-alert tests for the Worker's POST /requests route.
 *
 * Runs the real worker/src/index.js (imported as a data: URL so no package.json
 * "type" is needed) with fetch() stubbed, so both the GitHub call and the Teams
 * webhook call are captured and asserted without touching the network.
 *
 *   node worker/tests/teams.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const src = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;

const ISSUE = { number: 42, html_url: "https://github.com/be-apps-tools/1127/issues/42" };
const REASSIGN = {
  type: "reassign", site: "36620001127", unit: "366465538", serial: "EMSU492396-2",
  description: "Conex 40' HC Maint. Storage", currentTrade: "", requestedTrade: "Civil",
  detail: "Belongs to the civil crew", requester: "Ruben Ruiz",
};
const ISSUE_REQ = { ...REASSIGN, type: "issue", requestedTrade: "", currentTrade: "Mechanical",
  detail: "Door latch broken" };

/* Run one POST /requests through the worker. `hookStatus` drives what the stubbed
 * Teams webhook answers with; "throw" simulates the endpoint being unreachable. */
async function submit(body, { webhook = "", hookStatus = 202 } = {}){
  const calls = [], pending = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init, body: init.body ? JSON.parse(init.body) : null });
    if (u.startsWith("https://api.github.com/")) return new Response(JSON.stringify(ISSUE), { status: 201 });
    if (hookStatus === "throw") throw new Error("connect ECONNREFUSED");
    return new Response("1", { status: hookStatus });
  };
  const env = { SUBMIT_KEY: "sk", GH_TOKEN: "t", GH_REPO: "o/r", TEAMS_WEBHOOK_URL: webhook };
  const req = new Request("https://w.example/requests", {
    method: "POST", headers: { "x-submit-key": "sk", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await worker.fetch(req, env, { waitUntil: p => pending.push(p) });
  const json = await res.json();
  await Promise.all(pending);            // let the fire-and-forget alert finish
  return { res, json, calls, gh: calls.filter(c => c.url.startsWith("https://api.github.com/")),
    hook: calls.filter(c => !c.url.startsWith("https://api.github.com/")) };
}

const WORKFLOW_HOOK = "https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x";
const LEGACY_HOOK = "https://blattnerenergy.webhook.office.com/webhookb2/abc@def/IncomingWebhook/ghi/jkl";
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("no webhook configured -> GitHub only, submit still succeeds", async () => {
  const r = await submit(REASSIGN);
  assert.equal(r.res.status, 201);
  assert.deepEqual(r.json, { ok: true, issueNumber: 42, url: ISSUE.html_url });
  assert.equal(r.gh.length, 1);
  assert.equal(r.hook.length, 0, "nothing posted when TEAMS_WEBHOOK_URL is unset");
});

test("Workflows webhook -> Adaptive Card with the request's facts", async () => {
  const r = await submit(REASSIGN, { webhook: WORKFLOW_HOOK });
  assert.equal(r.res.status, 201);
  assert.equal(r.hook.length, 1);
  assert.equal(r.hook[0].url, WORKFLOW_HOOK);
  assert.equal(r.hook[0].init.method, "POST");
  assert.equal(r.hook[0].init.headers["Content-Type"], "application/json");

  const p = r.hook[0].body;
  assert.equal(p.type, "message");
  const card = p.attachments[0].content;
  assert.equal(p.attachments[0].contentType, "application/vnd.microsoft.card.adaptive");
  assert.equal(card.type, "AdaptiveCard");
  assert.equal(card.body[0].text, "Trade reassignment requested — Unit 366465538 -> Civil");
  const facts = Object.fromEntries(card.body[1].facts.map(f => [f.title, f.value]));
  assert.deepEqual(facts, {
    "Unit": "366465538", "Serial": "EMSU492396-2", "Description": "Conex 40' HC Maint. Storage",
    "Site": "36620001127", "Current trade": "(none)", "Requested trade": "Civil",
    "Detail": "Belongs to the civil crew", "Requester": "Ruben Ruiz",
  });
  assert.deepEqual(card.actions, [{ type: "Action.OpenUrl", title: "Open request", url: ISSUE.html_url }]);
});

test("issue-type request -> issue headline, no requested-trade fact", async () => {
  const r = await submit(ISSUE_REQ, { webhook: WORKFLOW_HOOK });
  const card = r.hook[0].body.attachments[0].content;
  assert.equal(card.body[0].text, "Asset issue reported — Unit 366465538");
  const titles = card.body[1].facts.map(f => f.title);
  assert.ok(!titles.includes("Requested trade"), "no requested trade on an issue report");
  assert.equal(card.body[1].facts.find(f => f.title === "Current trade").value, "Mechanical");
});

test("legacy connector host -> MessageCard instead of Adaptive Card", async () => {
  const r = await submit(REASSIGN, { webhook: LEGACY_HOOK });
  const p = r.hook[0].body;
  assert.equal(p["@type"], "MessageCard");
  assert.equal(p.title, "Trade reassignment requested — Unit 366465538 -> Civil");
  assert.equal(p.sections[0].markdown, false, "user text must not be parsed as markdown");
  const facts = Object.fromEntries(p.sections[0].facts.map(f => [f.name, f.value]));
  assert.equal(facts["Requester"], "Ruben Ruiz");
  assert.equal(p.potentialAction[0].targets[0].uri, ISSUE.html_url);
});

test("webhook 500 -> submit still returns 201", async () => {
  const r = await submit(REASSIGN, { webhook: WORKFLOW_HOOK, hookStatus: 500 });
  assert.equal(r.res.status, 201);
  assert.equal(r.json.ok, true);
});

test("webhook unreachable -> submit still returns 201", async () => {
  const r = await submit(REASSIGN, { webhook: WORKFLOW_HOOK, hookStatus: "throw" });
  assert.equal(r.res.status, 201);
  assert.equal(r.json.ok, true);
});

test("a rejected request never alerts", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push(String(url)); return new Response("{}", { status: 201 }); };
  const req = new Request("https://w.example/requests", {
    method: "POST", headers: { "x-submit-key": "wrong", "content-type": "application/json" },
    body: JSON.stringify(REASSIGN),
  });
  const res = await worker.fetch(req, { SUBMIT_KEY: "sk", TEAMS_WEBHOOK_URL: WORKFLOW_HOOK }, { waitUntil(){} });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0, "bad key must not reach GitHub or Teams");
});

let failed = 0;
for (const [name, fn] of tests){
  try { await fn(); console.log("ok   - " + name); }
  catch (e){ failed++; console.log("FAIL - " + name + "\n      " + (e && e.message)); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
