"""Tests for the Asset-KPI report adapters and the data/kpis.json build."""
import json
import os
import shutil

import pytest

from build import kpi_reports as K
from build.build_kpis import build
from build.xlsx_read import norm_header, sheet_rows

FX = os.path.join(os.path.dirname(__file__), "fixtures")
UTIL = os.path.join(FX, "kpi_util_mini.xlsx")
MAINT = os.path.join(FX, "kpi_maint_mini.xlsx")
COST = os.path.join(FX, "kpi_cost_mini.xlsx")
EM = os.path.join(FX, "mini.xlsx")
CASES = json.load(open(os.path.join(FX, "kpi_coerce_cases.json"), encoding="utf-8"))


def header_of(path):
    return [norm_header(h) for h in next(iter(sheet_rows(path)))]


# ------------------------------------------------------------------ coercion
@pytest.mark.parametrize("raw,want", CASES["num"])
def test_coerce_num(raw, want):
    got = K.coerce_num(raw)
    assert got == want and (got is None) == (want is None)


@pytest.mark.parametrize("raw,want", CASES["int"])
def test_coerce_int(raw, want):
    got = K.coerce_int(raw)
    assert got == want and (got is None) == (want is None)


@pytest.mark.parametrize("raw,want", CASES["date"])
def test_coerce_date(raw, want):
    assert K.coerce_date(raw) == want


def test_coerce_num_never_returns_negative_zero():
    # -0.0 would serialize as "-0.0" in Python and "0" in JS, drifting the two ports.
    assert str(K.coerce_num("-0")) == "0.0"


# ------------------------------------------------------------------ detection
def test_detect_kind_by_headers():
    assert K.detect_kind(header_of(UTIL), UTIL) == "utilization"
    assert K.detect_kind(header_of(MAINT), MAINT) == "maintenance"
    assert K.detect_kind(header_of(COST), COST) == "cost"


def test_detect_ignores_filename_when_headers_are_clear():
    # Same headers, a filename that hints at the wrong family: headers win.
    assert K.detect_kind(header_of(UTIL), "Monthly Cost Report.xlsx") == "utilization"


def test_detect_rejects_the_equipment_master():
    # The Equipment Master has a unit column but no KPI signal columns.
    assert K.detect_kind(header_of(EM), EM) is None


def test_detect_needs_a_unit_or_serial_column():
    assert K.detect_kind(["Hour Meter", "Idle Hours"], "x.xlsx") is None


def test_header_matching_is_case_and_whitespace_insensitive():
    m = K.map_headers(["unit\n number", "  HOUR   METER "], "utilization")
    assert m["unit"] == 0 and m["cols"]["meterHours"] == 1


# ------------------------------------------------------------------ extraction
def test_extract_utilization():
    ex = K.read_report(UTIL)
    u = ex["units"]
    assert ex["report"]["kind"] == "utilization"
    assert u["U1"]["meterHours"] == 5200
    assert u["U1"]["idleHours"] == 300 and u["U1"]["workHours"] == 900
    assert u["U1"]["meterDate"] == "2025-12-09"          # excel serial 46000
    assert u["U1"]["serial"] == "S1"
    assert "U9" in u                                      # not in the Master — kept, flagged by the page
    assert "SN:S3" in u                                   # serial-only row
    assert ex["report"]["rows"] == 4                       # the unit-less, serial-less row is skipped
    assert ex["report"]["asOf"] == "2025-12-09"


def test_extract_cost_cleans_money():
    u = K.read_report(COST)["units"]
    assert u["U1"]["monthlyCost"] == 4200 and u["U1"]["costToDate"] == 19400
    assert u["U2"]["monthlyCost"] == -150                  # "(150)" is a credit, not junk
    assert "costToDate" not in u["U2"]                     # blank cell isn't a zero
    assert u["U1"]["vendor"] == "Holt CAT"


def test_extract_maintenance_keeps_zeroes():
    u = K.read_report(MAINT)["units"]
    assert u["U1"]["openWo"] == 2 and u["U1"]["pmDueDate"] == "2026-09-15"
    assert u["U3"]["downDays"] == 4
    assert u["U3"]["openWo"] == 0                          # zero open WOs is a fact, not a blank


def test_extract_rejects_a_sheet_with_no_recognised_columns():
    rows = [["Unit Number", "Colour"], ["U1", "red"]]
    with pytest.raises(ValueError, match="No recognised"):
        K.extract(rows, "utilization", "x.xlsx")


# ------------------------------------------------------------------ merge
def test_merge_replaces_only_the_supplied_family():
    b = K.merge({}, [K.read_report(UTIL), K.read_report(MAINT), K.read_report(COST)])
    assert set(r["kind"] for r in b["reports"]) == {"utilization", "maintenance", "cost"}
    assert b["units"]["U1"]["cost"]["monthlyCost"] == 4200

    # Re-import utilization only: cost/maintenance survive untouched.
    again = K.merge(b, [K.read_report(UTIL)])
    assert again["units"]["U1"]["cost"]["monthlyCost"] == 4200
    assert again["units"]["U1"]["maintenance"]["openWo"] == 2
    assert again["units"]["U1"]["utilization"]["meterHours"] == 5200
    assert len(again["reports"]) == 3                       # replaced in place, not appended


def test_merge_drops_stale_units_of_a_replaced_family():
    b = K.merge({}, [K.read_report(UTIL)])
    assert "U9" in b["units"]
    thin = {"units": {"U1": {"meterHours": 1.0}},
            "report": {"kind": "utilization", "label": "l", "file": "f", "rows": 1,
                       "units": 1, "asOf": "", "columns": ["meterHours"]}}
    b2 = K.merge(b, [thin])
    assert "U9" not in b2["units"]                          # gone from the new report -> gone
    assert b2["units"]["U1"]["utilization"] == {"meterHours": 1.0}


def test_merge_does_not_mutate_the_extract_result():
    ex = K.read_report(UTIL)
    K.merge({}, [ex])
    assert ex["units"]["U1"]["serial"] == "S1"              # merge popped a copy, not this


def test_merge_keeps_reports_in_spec_order():
    b = K.merge({}, [K.read_report(COST), K.read_report(UTIL)])
    assert [r["kind"] for r in b["reports"]] == ["utilization", "cost"]


# ------------------------------------------------------------------ build()
def test_build_end_to_end(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    for f in (UTIL, MAINT, COST):
        shutil.copy(f, src / os.path.basename(f))
    shutil.copy(EM, src / "Equipment Master V1.9.xlsx")     # owned by build_data, must be ignored

    os.environ["BUILD_TS"] = "2026-08-27T12:00:00Z"
    try:
        res = build(str(src), str(out))
    finally:
        os.environ.pop("BUILD_TS", None)

    assert sorted(res["reports"]) == ["cost", "maintenance", "utilization"]
    assert res["skipped"] == []
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle["builtAt"] == "2026-08-27T12:00:00Z"
    assert bundle["units"]["U1"]["utilization"]["meterHours"] == 5200
    assert not any(r["file"].startswith("Equipment Master") for r in bundle["reports"])


def test_build_is_incremental_across_runs(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    shutil.copy(COST, src / os.path.basename(COST))
    build(str(src), str(out))
    # Second run: the cost report is gone from source/, a utilization one appears.
    os.remove(src / os.path.basename(COST))
    shutil.copy(UTIL, src / os.path.basename(UTIL))
    build(str(src), str(out))
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    # Cost data published earlier (by the Action or the browser importer) is kept:
    # only families present in this run are replaced.
    assert bundle["units"]["U1"]["cost"]["monthlyCost"] == 4200
    assert bundle["units"]["U1"]["utilization"]["meterHours"] == 5200


def test_build_reports_unrecognised_files_without_failing(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    shutil.copy(UTIL, src / os.path.basename(UTIL))
    shutil.copy(EM, src / "Some Other Sheet.xlsx")          # parses, but no KPI columns
    res = build(str(src), str(out))
    assert res["reports"] == ["utilization"]
    assert [s["file"] for s in res["skipped"]] == ["Some Other Sheet.xlsx"]
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle["skipped"][0]["reason"]


def test_build_with_no_reports_writes_an_empty_bundle(tmp_path):
    out = tmp_path / "data"
    res = build(str(tmp_path / "nope"), str(out))
    assert res == {"reports": [], "units": 0, "skipped": []}
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle == {"builtAt": "", "reports": [], "units": {}}


def test_build_survives_a_corrupt_existing_bundle(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    out.mkdir()
    (out / "kpis.json").write_text("{not json", encoding="utf-8")
    shutil.copy(UTIL, src / os.path.basename(UTIL))
    build(str(src), str(out))
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle["units"]["U1"]["utilization"]["meterHours"] == 5200
