/**
 * Loads the explainer's tool implementations out of kpis.html.
 *
 * Same trick as _kpi_work.mjs: the page is a plain script, so the marked blocks
 * are lifted out and evaluated with stubs for the page helpers. The stubs are
 * the page's own formatters, because the whole point of these tools is that they
 * hand the model the same strings the screen shows.
 *
 * STATE.rows is settable from a test, so a fixture fleet flows through the real
 * scopeRows -> deriveKpi -> tool path.
 */
import { readFile } from "node:fs/promises";

const PAGE = await readFile(new URL("../../kpis.html", import.meta.url), "utf8");

function block(name) {
  const re = new RegExp("/\\* " + name + "-START \\*/([\\s\\S]*?)/\\* " + name + "-END \\*/");
  const m = PAGE.match(re);
  if (!m) throw new Error("no " + name + " block in kpis.html");
  return m[1];
}

const PRELUDE = `
const TREND_MONTHS = 12, REPEAT_DOWNS = 3, DAYS_PER_MONTH = 30.44, DASH = "\\u2014";
const LONG_DOWN_DAYS = 7, RENEW_SOON_DAYS = 30, DAMAGE_SHARE_PCT = 10;
const KPI_KINDS = ["rates","rental","transfers","damage","hours","utilization"];
const KPI_SPEC = { statusLabels: { DN: "Down - on site", DS: "Down - in shop" }, kinds: [
  {kind:"rates",label:"Equipment Rates"}, {kind:"rental",label:"Anniversary Date"},
  {kind:"transfers",label:"Equipment Transfer"}, {kind:"damage",label:"Damage Expenses"},
  {kind:"hours",label:"Equipment Hours"}, {kind:"utilization",label:"Equipment Utilization"}] };
const STATE = { rows: [], drill: null, site: "36620001127", meta: { sourceVersion: "V1.315" },
                kpis: { reports: [], units: {} } };
const sum = list => list.filter(v=>v!=null&&!isNaN(v)).reduce((s,v)=>s+v,0);
const num = v => (v==null||v===""||isNaN(Number(v))) ? null : Number(v);
const fmtNum = (n,dp) => n==null||isNaN(n) ? DASH
  : Number(n).toLocaleString("en-US",{minimumFractionDigits:dp||0,maximumFractionDigits:dp||0});
const fmtMoney = n => n==null||isNaN(n) ? DASH
  : (n<0?"-":"")+"$"+Math.abs(Math.round(n)).toLocaleString("en-US");
const fmtMoneyShort = fmtMoney;
const fmtMonth = m => String(m);
const esc = s => String(s);
const monthList = () => [];
const damageByMonth = () => ({});
const worstDamageMonth = () => DASH;
const columns = () => [];
const FIELD_LABELS = {};
const DRILL_LABELS = {};
const scopeRows = () => STATE.rows;
const scopeParts = () => [];
const reportFor = kind => (STATE.kpis.reports||[]).find(r=>r.kind===kind) || null;
const staleness = rep => rep ? { age: 0, level: "" } : { age: null, level: "" };
const ageText = age => age === 0 ? "refreshed today" : (age == null ? "age unknown" : age + " days old");
const askOn = () => false;
// Not renderWork — the KPI-WORK block declares it, and a second const of the
// same name is a SyntaxError that kills the whole module.
const wbase = () => "";
const $ = () => null;
const toast = () => {};
const copyFallback = () => true;
const nsGet = () => "";
const navigator = {};
`;

const src = PRELUDE + block("KPI-DRILLS") + block("KPI-WORK") + block("KPI-FOCUS") +
  block("KPI-ASK-TOOLS") +
  "\nexport { ASK_IMPL, FOCUS_PRED, DERIVE, DRILLS, deriveKpi, STATE };\n";

export const P = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
export const { ASK_IMPL, FOCUS_PRED, DERIVE, DRILLS, deriveKpi, STATE } = P;
