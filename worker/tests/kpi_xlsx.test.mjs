/**
 * Regression tests for the .xlsx part resolution in kpis.html.
 *
 * XML attribute order is arbitrary in OOXML, and it differs by writer:
 *   Excel      <Relationship Id="rId1" Type="…" Target="worksheets/sheet1.xml"/>
 *   the real
 *   JDE export <Relationship Type="…" Target="worksheets/sheet1.xml" Id="rId6"/>
 *
 * The page originally matched Id and Target with one positional regex, so it
 * resolved the sheet path to "" on every real export and read zero rows — while
 * the Python side, which uses a real XML parser, handled them fine. Only feeding
 * the actual files through a browser caught it. These cases pin both orders.
 *
 *   node worker/tests/kpi_xlsx.test.mjs
 */
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const page = await readFile(new URL("../../kpis.html", import.meta.url), "utf8");
const from = page.indexOf("function kpiAttr(tag, name){");
const to = page.indexOf("async function kpiFirstSheetRows(file){");
assert.ok(from > 0 && to > from, "couldn't slice the part-resolution helpers out of kpis.html");
const { kpiAttr, kpiRelMap, kpiSheetRelId } = await import(
  "data:text/javascript;base64," + Buffer.from(
    page.slice(from, to) + "\nexport { kpiAttr, kpiRelMap, kpiSheetRelId };\n").toString("base64"));

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

/* ---------- attribute reads are order-independent ---------- */
eq(kpiAttr('<Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/>', "Target"),
   "worksheets/sheet1.xml", "Id first (Excel)");
eq(kpiAttr('<Relationship Type="t" Target="worksheets/sheet1.xml" Id="rId6" />', "Id"),
   "rId6", "Target before Id (the real JDE export)");
eq(kpiAttr('<sheet name="Equipment Rates" sheetId="1" r:id="rId6"/>', "r:id"), "rId6",
   "namespaced attribute");
eq(kpiAttr('<sheet r:id="rId2" name="x"/>', "r:id"), "rId2");
eq(kpiAttr("<sheet name='x'/>", "r:id"), "", "absent attribute reads as empty, not undefined");
// A substring of another attribute's name must not match.
eq(kpiAttr('<Relationship TargetMode="External" Target="real.xml" Id="rId1"/>', "Target"),
   "real.xml", "TargetMode must not be mistaken for Target");

/* ---------- the real export's rels shape ---------- */
{
  // Trimmed verbatim from 403a4ac2-Equipment_Rates_2.xlsx.
  const rels = '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml" Id="rId3" />'
    + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml" Id="rId4" />'
    + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml" Id="rId6" />'
    + '</Relationships>';
  const map = kpiRelMap(rels);
  eq(map.rId6, "worksheets/sheet1.xml", "the worksheet resolves");
  eq(map.rId4, "sharedStrings.xml");
  eq(Object.keys(map).length, 3);
}

/* ---------- Excel's own order still works ---------- */
{
  const rels = '<Relationships><Relationship Id="rId1" Type="…/worksheet" Target="worksheets/sheet1.xml"/>'
    + '<Relationship Id="rId2" Type="…/sharedStrings" Target="sharedStrings.xml"/></Relationships>';
  const map = kpiRelMap(rels);
  eq(map.rId1, "worksheets/sheet1.xml");
  eq(map.rId2, "sharedStrings.xml");
}

/* ---------- first sheet, whatever the attribute order ---------- */
eq(kpiSheetRelId('<workbook><sheets><sheet name="Equipment Rates" sheetId="1" r:id="rId6"/></sheets></workbook>'),
   "rId6", "the real export names the sheet before its r:id");
eq(kpiSheetRelId('<workbook><sheets><sheet r:id="rId1" sheetId="1" name="Sheet1"/></sheets></workbook>'),
   "rId1");
eq(kpiSheetRelId('<workbook><sheets><sheet name="A" r:id="rId9"/><sheet name="B" r:id="rId10"/></sheets></workbook>'),
   "rId9", "the FIRST sheet wins, matching the Python reader");
eq(kpiSheetRelId('<workbook><sheets/></workbook>'), "", "no sheet -> empty, so the caller can error clearly");
// The container element must not be mistaken for a sheet.
eq(kpiSheetRelId('<workbook><sheets><sheet name="A" r:id="rId1"/></sheets></workbook>'), "rId1",
   "<sheets> is not a <sheet>");

/* ---------- an absolute target is normalised ---------- */
eq(kpiRelMap('<Relationship Target="/xl/worksheets/sheet1.xml" Id="rId1"/>').rId1,
   "/xl/worksheets/sheet1.xml", "kept verbatim here; kpiFirstSheetRows strips the leading slash");

console.log(`kpi xlsx part resolution: ${n} assertions OK`);
