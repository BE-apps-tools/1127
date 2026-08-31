"""Tests for the Asset-KPI report adapters and the data/kpis.json build.

The fixtures mirror the real JDE exports' shapes (title rows above the header,
duplicate 'Description' columns, '$4,200.00', '(150)', the transfer event log and
its initial-load snapshot block) — see make_kpi_fixture.py.
"""
import json
import os
import shutil

import pytest

from build import kpi_reports as K
from build.build_kpis import build
from build.xlsx_read import norm_header, sheet_rows

FX = os.path.join(os.path.dirname(__file__), "fixtures")
RATES = os.path.join(FX, "kpi_rates_mini.xlsx")
RENTAL = os.path.join(FX, "kpi_rental_mini.xlsx")
TRANSFERS = os.path.join(FX, "kpi_transfers_mini.xlsx")
UTIL = os.path.join(FX, "kpi_util_mini.xlsx")
EM = os.path.join(FX, "mini.xlsx")
CASES = json.load(open(os.path.join(FX, "kpi_coerce_cases.json"), encoding="utf-8"))


def header_of(path):
    rows = list(sheet_rows(path))
    return [norm_header(h) for h in rows[K.find_header(rows)]]


def events_of(path, unit):
    return K.read_report(path)["units"][unit]["events"]


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
    # -0.0 would serialize as "-0.0" in Python and "0" in JS, drifting the ports.
    assert str(K.coerce_num("-0")) == "0.0"


def test_absurd_dates_are_dropped():
    # JDE ships a 2169 "billed through" as a no-end sentinel; showing it as a real
    # renewal date would put a bogus row at the top of every renewal filter.
    assert K.coerce_date("98000") == ""
    assert K.coerce_date("2169-03-24") == ""
    assert K.coerce_date("2026-09-15") == "2026-09-15"


# ------------------------------------------------------------------ header row
def test_finds_a_header_below_title_rows():
    rows = list(sheet_rows(RATES))
    assert K.find_header(rows) == 4, "Equipment Rates puts four rows above its header"
    rows = list(sheet_rows(RENTAL))
    assert K.find_header(rows) == 1, "Anniversary Date has one title row"
    rows = list(sheet_rows(TRANSFERS))
    assert K.find_header(rows) == 0


def test_header_matching_is_case_and_whitespace_insensitive():
    m = K.map_headers(["unit\n number", "  MONTHLY   BILLING rate "], "rates")
    assert m["unit"] == 0 and m["cols"]["monthlyBillingRate"] == 1


def test_first_column_of_a_repeated_name_wins():
    # Anniversary Date repeats 'Description' for an unrelated ID column.
    hdr = header_of(RENTAL)
    assert hdr.count("Description") == 2
    m = K.map_headers(hdr, "rental")
    assert m["unit"] == 0


# ------------------------------------------------------------------ detection
def test_detect_kind_by_headers():
    assert K.detect_kind(header_of(RATES), RATES) == "rates"
    assert K.detect_kind(header_of(RENTAL), RENTAL) == "rental"
    assert K.detect_kind(header_of(TRANSFERS), TRANSFERS) == "transfers"
    assert K.detect_kind(header_of(UTIL), UTIL) == "utilization"


def test_rates_and_rental_are_not_confused():
    # Both carry Unit Number, Description and Billing Type — only the signal
    # columns tell them apart, so a rename upstream can't cross them over.
    assert K.detect_kind(header_of(RATES), "Anniversary Date 6.xlsx") == "rates"
    assert K.detect_kind(header_of(RENTAL), "Equipment Rates 2.xlsx") == "rental"


def test_detect_rejects_the_equipment_master():
    assert K.detect_kind(header_of(EM), EM) is None


def test_detect_needs_a_unit_or_serial_column():
    assert K.detect_kind(["Monthly Billing Rate", "Rate Group"], "x.xlsx") is None


# ------------------------------------------------------------------ rates
def test_extract_rates():
    u = K.read_report(RATES)["units"]
    assert u["U1"]["monthlyBillingRate"] == 7392          # from "7,392.00"
    assert u["U1"]["hourlyBillingRate"] == 51.61
    assert u["U1"]["rateGroupDesc"] == "Whl Ldr LT 2 cu yards"
    assert u["U1"]["pmComponent"] == 0.66                 # survives the blank spacer column
    assert u["U1"]["repairComponent"] == 2.59
    assert u["U2"]["monthlyNonHourlyOwnership"] == 1250
    assert "U9" in u                                       # not in the Master; page flags it


def test_rates_report_has_no_as_of():
    # Its only dates are the rate window (future), which is not "data as of".
    assert K.read_report(RATES)["report"]["asOf"] == ""


# ------------------------------------------------------------------ rental
def test_extract_rental():
    u = K.read_report(RENTAL)["units"]
    assert u["U2"]["vendor"] == "Northern Rentals LLC"
    assert u["U2"]["monthlyNonHourlyRate"] == 125         # from "$125.00"
    assert u["U2"]["totalNonHourlyRate"] == 1315          # from "1,315.0000"
    assert u["U2"]["contractDays"] == 28
    assert u["U1"]["billedThroughDate"]                   # a real date stays
    assert "billedThroughDate" not in u["U3"], "the 2169 sentinel must not become a date"
    assert u["U3"]["totalNonHourlyRate"] == -150          # "(150)" is a credit


# ------------------------------------------------------------------ transfers
def test_transfer_timeline_is_ordered_and_typed():
    ev = events_of(TRANSFERS, "U1")
    assert [e["date"] for e in ev] == sorted(e["date"] for e in ev), "oldest first"
    assert [e["status"] for e in ev] == ["WK", "DN", "WK", "DS", "WK"]
    assert ev[1]["remark"] == "hydraulic leak"
    assert ev[1]["prev"] == "WK"


def test_initial_load_snapshot_collapses_to_one_arrival():
    # U2 has three same-date "Newly Acquired" rows with no previous status, each
    # repeating a different remark. Treating them as state changes would invent a
    # WK->DN->DS sequence out of a single arrival.
    ev = events_of(TRANSFERS, "U2")
    assert len(ev) == 1
    assert ev[0]["status"] == "", "state unknown, so it counts as neither up nor down"
    assert ev[0]["arrival"] is True


def test_same_day_changes_collapse_to_the_end_of_day_state():
    # U4 broke and was fixed the same day: the day ends with it working.
    ev = events_of(TRANSFERS, "U4")
    assert len(ev) == 1 and ev[0]["status"] == "WK"
    assert ev[0]["remark"] == "tire changed same day"


def test_undated_rows_are_not_events():
    assert "U6" not in K.read_report(TRANSFERS)["units"]


def test_transfer_unit_fields_come_off_the_newest_row():
    u = K.read_report(TRANSFERS)["units"]
    assert u["U1"]["eqClass"] == "Excavator"
    assert u["U3"]["eqClass"] == "Survey"
    assert u["U1"]["transferTrade"] == "CIVIL"


def test_transfer_report_counts_timeline_events_not_raw_rows():
    r = K.read_report(TRANSFERS)["report"]
    assert r["rows"] == 10, "13 raw rows collapse to 10 timeline events"
    assert r["units"] == 5
    assert r["asOf"], "the newest effective date is a real as-of"


def test_open_and_closed_down_spans_are_both_kept():
    # U3 is still down (no closing event) — the page must be able to tell.
    ev = events_of(TRANSFERS, "U3")
    assert ev[-1]["status"] == "DN"
    assert len(ev) == 2


# ------------------------------------------------------------------ site stamp
def test_site_comes_from_a_title_row():
    rows = [["36620001127 - NEER High Spring Slr, OK"], [], ["Unit Number", "Monthly Billing Rate"],
            ["U1", "100"]]
    assert K.report_site(rows, 2) == "36620001127"


def test_site_falls_back_to_the_reports_own_column():
    rows = [["Unit Number", "Location", "Bare Rental Rate"],
            ["U1", "36620001127", "10"], ["U2", "36620001127", "20"], ["U3", "36620001071", "30"]]
    assert K.report_site(rows, 0, 1) == "36620001127", "the most common site wins"


def test_site_is_blank_when_nothing_names_one():
    rows = [["Unit Number", "Bare Rental Rate"], ["U1", "10"]]
    assert K.report_site(rows, 0, None) == ""


# ------------------------------------------------------------------ merge
def test_merge_replaces_only_the_supplied_family():
    b = K.merge({}, [K.read_report(RATES), K.read_report(RENTAL), K.read_report(TRANSFERS)])
    assert set(r["kind"] for r in b["reports"]) == {"rates", "rental", "transfers"}
    assert b["units"]["U1"]["rates"]["monthlyBillingRate"] == 7392

    again = K.merge(b, [K.read_report(RATES)])
    assert again["units"]["U1"]["rental"]["vendor"] == "Acme Equipment Co"
    assert len(again["units"]["U1"]["transfers"]["events"]) == 5
    assert again["units"]["U1"]["rates"]["monthlyBillingRate"] == 7392
    assert len(again["reports"]) == 3, "replaced in place, not appended"


def test_merge_drops_stale_units_of_a_replaced_family():
    b = K.merge({}, [K.read_report(RATES)])
    assert "U9" in b["units"]
    thin = {"units": {"U1": {"monthlyBillingRate": 1.0}},
            "report": {"kind": "rates", "label": "l", "file": "f", "rows": 1,
                       "units": 1, "asOf": "", "site": "", "columns": ["monthlyBillingRate"]}}
    b2 = K.merge(b, [thin])
    assert "U9" not in b2["units"]
    assert b2["units"]["U1"]["rates"] == {"monthlyBillingRate": 1.0}


def test_merge_does_not_mutate_the_extract_result():
    ex = K.read_report(RENTAL)
    K.merge({}, [ex])
    assert ex["units"]["U1"]["serial"] == "S1"


def test_merge_keeps_reports_in_spec_order():
    b = K.merge({}, [K.read_report(UTIL), K.read_report(RENTAL), K.read_report(RATES)])
    assert [r["kind"] for r in b["reports"]] == ["rates", "rental", "utilization"]


# ------------------------------------------------------------------ build()
def test_build_end_to_end(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    for f in (RATES, RENTAL, TRANSFERS, UTIL):
        shutil.copy(f, src / os.path.basename(f))
    shutil.copy(EM, src / "Equipment Master V1.9.xlsx")     # owned by build_data, must be ignored

    os.environ["BUILD_TS"] = "2026-08-31T12:00:00Z"
    try:
        res = build(str(src), str(out))
    finally:
        os.environ.pop("BUILD_TS", None)

    assert sorted(res["reports"]) == ["rates", "rental", "transfers", "utilization"]
    assert res["skipped"] == []
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle["builtAt"] == "2026-08-31T12:00:00Z"
    assert bundle["units"]["U1"]["rates"]["monthlyBillingRate"] == 7392
    assert len(bundle["units"]["U1"]["transfers"]["events"]) == 5
    assert not any(r["file"].startswith("Equipment Master") for r in bundle["reports"])


def test_build_is_incremental_across_runs(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    shutil.copy(RENTAL, src / os.path.basename(RENTAL))
    build(str(src), str(out))
    # Second run: the rental report is gone from source/, a transfer one appears.
    os.remove(src / os.path.basename(RENTAL))
    shutil.copy(TRANSFERS, src / os.path.basename(TRANSFERS))
    build(str(src), str(out))
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    # Rental data published earlier (by the Action or the browser importer) is
    # kept: only families present in this run are replaced.
    assert bundle["units"]["U1"]["rental"]["vendor"] == "Acme Equipment Co"
    assert len(bundle["units"]["U1"]["transfers"]["events"]) == 5


def test_build_reports_unrecognised_files_without_failing(tmp_path):
    src = tmp_path / "source"
    src.mkdir()
    out = tmp_path / "data"
    shutil.copy(RATES, src / os.path.basename(RATES))
    shutil.copy(EM, src / "Some Other Sheet.xlsx")          # parses, but no KPI columns
    res = build(str(src), str(out))
    assert res["reports"] == ["rates"]
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
    shutil.copy(RATES, src / os.path.basename(RATES))
    build(str(src), str(out))
    bundle = json.load(open(out / "kpis.json", encoding="utf-8"))
    assert bundle["units"]["U1"]["rates"]["monthlyBillingRate"] == 7392
