/**
 * Report-family detection, and the floor that stops a single incidental column
 * from claiming a family.
 *
 * A real JDE export (EquipmentDetailGrid — posted equipment hours, none of the
 * five families) has a two-row header whose upper row is just group labels:
 *
 *   Equipment |     | Date | Job | Foreman | Cost Code | Hours by Rate |   |
 *   Code      | Desc|      | Code| Name    | Code      | Total (Rate 1)| …
 *
 * "Equipment" is a unit alias and "Date" is a transfer signal, so it scored one
 * hit and was detected as the transfer report. Publishing replaces a whole
 * family, so that would have wiped the real downtime history. Both ports now
 * require MIN_SIGNALS matches; every genuine export clears 4.
 *
 *   node worker/tests/kpi_detect.test.mjs
 */
import assert from "node:assert/strict";
import { KPI } from "./_kpi_core.mjs";

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };

/* ---------- the export that is none of the five ---------- */
const GRID_GROUP = ["Equipment", "", "Date", "Job", "Foreman", "Cost Code", "Hours by Rate", "", ""];
const GRID_SUB   = ["Code", "Description", "", "Code", "Name", "Code",
                    "Total (Rate 1)", "Ownership (Rate 2)", "Operating (Rate 3)"];
eq(KPI.detectKind(GRID_GROUP, "EquipmentDetailGrid_1.xlsx"), null,
   "the group-header row must not be claimed by any family");
eq(KPI.detectKind(GRID_SUB, "EquipmentDetailGrid_1.xlsx"), null,
   "the sub-header row has no unit column, so it matches nothing");

/* A filename hint must not rescue a file that fails the floor: the hint is only
   ever a tie-break, worth less than a single signal. */
eq(KPI.detectKind(GRID_GROUP, "equipment_transfer_hours.xlsx"), null,
   "a transfer-ish filename cannot promote a one-signal match");

/* ---------- one signal is never enough, on any family ---------- */
eq(KPI.detectKind(["Unit Number", "Vendor"], "anniversary.xlsx"), null,
   "one rental signal is not a rental report");
eq(KPI.detectKind(["Unit Number", "Rate Group"], "rates.xlsx"), null,
   "one rates signal is not a rates report");
eq(KPI.detectKind(["Unit Number", "Hour Meter"], "utilization.xlsx"), null,
   "one utilization signal is not a utilization report");

/* ---------- two still detects, so the floor is a floor and not a wall ---------- */
eq(KPI.detectKind(["Unit Number", "Vendor", "Billed Through Date"], "x.xlsx"), "rental",
   "two rental signals detect");
eq(KPI.detectKind(["Unit Number", "Current Status", "Previous Status"], "x.xlsx"), "transfers",
   "two transfer signals detect");

/* ---------- the real families are unaffected ---------- */
eq(KPI.detectKind(["Unit Number", "Current Status", "Previous Status", "Effective Date",
                   "Project Transferred From"], "Equipment_Transfer.xlsx"), "transfers",
   "the full transfer header still detects");
eq(KPI.detectKind(["Unit Number", "Rate Group", "Monthly Ownership", "Hourly Billing Rate",
                   "Monthly Non-Hourly Ownership"], "Equipment_Rates.xlsx"), "rates",
   "the full rates header still detects");
eq(KPI.detectKind(["Unit Number", "Actual Cost Amount", "G/L Date", "Document Number",
                   "Damage Area Code"], "Damage_Expenses.xlsx"), "damage",
   "the full damage header still detects");

/* ---------- no unit and no serial is still nothing, floor or not ---------- */
eq(KPI.detectKind(["Current Status", "Previous Status", "Effective Date"], "x.xlsx"), null,
   "without a unit or serial column there is nothing to attach records to");

eq(KPI.SPEC.minSignals >= 2, true, "the floor must be at least 2");

console.log(`kpi family detection: ${n} assertions OK`);
