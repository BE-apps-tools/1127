/**
 * Loads the KPI derivation engine out of kpis.html.
 *
 * The page is a plain script — no modules, no build step — so there is nothing to
 * import. Both registries sit between named markers (KPI-DRILLS-*, KPI-WORK-*)
 * exactly so this file can lift them out, wrap them with stubs for the page
 * helpers they lean on, and hand back a real `deriveKpi` to test against.
 *
 * The stubs are deliberately the page's own formatters, not simplified ones: the
 * ledger's numbers are what a manager reads back, so the test exercises the
 * strings the page actually renders.
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
const sum = list => list.filter(v=>v!=null&&!isNaN(v)).reduce((s,v)=>s+v,0);
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
const STATE = { drill:null, rows:[] };
const scopeRows = () => STATE.rows;
const $ = () => null;
const toast = () => {};
const copyFallback = () => true;
const navigator = {};
`;

const src = PRELUDE + block("KPI-DRILLS") + block("KPI-WORK") +
  "\nexport { DRILLS, DERIVE, deriveKpi, WORK_FMT, fmtWork, WORK_TOP };\n";

export const W = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
export const { DRILLS, DERIVE, deriveKpi, fmtWork, WORK_TOP } = W;
