/**
 * Loads kpi-core.js — the browser KPI import engine — into this process.
 *
 * kpi-core.js is a plain script (no build step, no module syntax: the pages load
 * it with a bare <script src>), and it publishes its surface as globalThis.KPI.
 * Wrapping the file in a data: module gives node the same result the browser
 * gets, without any of the string-offset slicing the suites used to do when the
 * engine lived inside kpis.html.
 */
import { readFile } from "node:fs/promises";

const src = await readFile(new URL("../../kpi-core.js", import.meta.url), "utf8");
await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));

if (!globalThis.KPI) throw new Error("kpi-core.js did not set globalThis.KPI");

export const KPI = globalThis.KPI;
export const CORE_SRC = src;
