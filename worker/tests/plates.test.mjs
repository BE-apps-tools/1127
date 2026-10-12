// The License Plate Report is joined to the Equipment Master in two places: build/plates.py
// (Action build) and inventory.html (browser import). Both must agree: the fixture below is
// the same one build/tests/test_build_data.py uses, with the same expected result.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import "./_kpi_core.mjs";   // publishes globalThis.KPI (the reader that copes with JDE's xlsx layout)

const html = await readFile(new URL("../../inventory.html", import.meta.url), "utf8");
const pick = (re) => { const m = re.exec(html); assert.ok(m, "not found in inventory.html: " + re); return m[0]; };
const src = [
  pick(/function emExcelSerialToISO[\s\S]*?\n}\n/),
  pick(/function emNormHeader[^\n]*\n/),
  pick(/const EM_NO_PLATE[^\n]*\n/),
  pick(/function emParsePlates[\s\S]*?\n}\n/),
].join("\n");
const { emParsePlates } = new Function(src + "\nreturn {emParsePlates};")();

const buf = await readFile(new URL("../../build/tests/fixtures/plates_mini.xlsx", import.meta.url));
const rows = await KPI.firstSheetRows({ arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
const p = emParsePlates(rows);

assert.deepEqual(p.U1, { plate: "NEW222", plateState: "MN", plateRenewal: "2027-05-31", vin: "VIN1" }, "later renewal wins");
assert.ok(!("U2" in p), "N/A is not a plate");
assert.equal(p.UX.plate, "ZZZ999");
assert.equal(Object.keys(p).length, 2);
assert.throws(() => emParsePlates([["Unit Number", "Description"], ["U1", "x"]]), /License Plate Report/);
console.log("plates ok");
