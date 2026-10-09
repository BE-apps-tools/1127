// Guards xlsx-export.js (the shared Excel writer): a valid zip with correct CRCs,
// well-formed parts, typed cells, escaped text, and Excel-legal sheet names.
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const X = createRequire(import.meta.url)("../../xlsx-export.js");

const blob = await X.build({
  title: "T & <Test>", subtitle: "sub", info: [["Site", "A"], ["Rows", 2]],
  overview: { breakdowns: [{ title: "By status", rows: X.tally([{ s: "a" }, { s: "a" }, { s: "" }], r => r.s) }] },
  sheets: [{ name: "Bad:/Name?*[]", freezeCols: 1, columns: [
    { header: "Unit", key: "u" }, { header: "Cost", key: "c", type: "money" },
    { header: "Day", key: "d", type: "date" }, { header: "Pct", key: "p", type: "pct" }],
    rows: [{ u: "x<&>\u0001", c: "1,234.5", d: "2025-01-01", p: 50 }, { u: "y", c: "n/a", d: "bad", p: null }] }]
});
const u8 = new Uint8Array(await blob.arrayBuffer());
const dv = new DataView(u8.buffer);

// Walk the central directory: every entry must inflate to its recorded size and CRC.
let eocd = u8.length - 22; assert.equal(dv.getUint32(eocd, true), 0x06054b50);
const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
const parts = {};
for (let i = 0; i < n; i++) {
  assert.equal(dv.getUint32(p, true), 0x02014b50);
  const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csz = dv.getUint32(p + 20, true), usz = dv.getUint32(p + 24, true);
  const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
  const name = Buffer.from(u8.subarray(p + 46, p + 46 + nl)).toString();
  const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
  const raw = Buffer.from(u8.subarray(ds, ds + csz));
  const data = method === 8 ? zlib.inflateRawSync(raw) : raw;
  assert.equal(data.length, usz, name); assert.equal(X._crc32(data), crc, name);
  parts[name] = data.toString(); p += 46 + nl + el + cl;
}
for (const f of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) assert.ok(parts[f], f);

assert.ok(!/[\[\]:*?\/\\]/.test(/<sheet name="([^"]+)" sheetId="2"/.exec(parts["xl/workbook.xml"])[1]), "sheet name sanitised");
const s2 = parts["xl/worksheets/sheet2.xml"];
assert.ok(s2.includes("x&lt;&amp;&gt;</t>"), "text escaped, control chars stripped");
assert.ok(s2.includes("<v>1234.5</v>"), "money parsed to a number");
assert.ok(s2.includes("<v>45658</v>"), "ISO date -> Excel serial (2025-01-01)");
assert.ok(s2.includes("n/a</t>") && s2.includes("bad</t>"), "unparseable values stay text");
assert.ok(s2.includes('state="frozen"') && s2.includes("<autoFilter"), "frozen header + filter");
assert.ok(parts["xl/worksheets/sheet1.xml"].includes("dataBar"), "overview has data bars");
assert.ok(parts["xl/worksheets/sheet1.xml"].includes("(blank)"), "blank label shown as (blank)");
assert.equal(X._dateSerial("1970-01-01"), 25569);
console.log("xlsx_export ok");
