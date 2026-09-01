"""The KPI report spec must be identical in Python and in kpi-core.js.

The Action build (build/kpi_reports.py) and the in-browser importer both extract
records from the same spreadsheets and write to the same data/kpis.json, so a
header alias added on one side only would silently produce two different
datasets. kpi-core.js — the engine the admin KPI builder and the KPI page share —
embeds a verbatim copy of SPEC between the KPI-REPORT-SPEC markers;
`py scripts/sync_kpi_spec.py` regenerates it.
"""
import json
import os
import re

from build.kpi_reports import SPEC, detect_kind, header_at


def merge_header(two_rows):
    return header_at(two_rows, 1)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CORE = os.path.join(ROOT, "kpi-core.js")
BLOCK_RE = re.compile(
    r"/\* KPI-REPORT-SPEC-START \*/\s*const KPI_SPEC = (\{.*?\});\s*/\* KPI-REPORT-SPEC-END \*/",
    re.DOTALL)


def core_src():
    with open(CORE, encoding="utf-8") as f:
        return f.read()


def embedded_spec():
    m = BLOCK_RE.search(core_src())
    assert m, "no KPI-REPORT-SPEC block in kpi-core.js — run py scripts/sync_kpi_spec.py"
    return json.loads(m.group(1))


def test_embedded_spec_matches_python():
    assert embedded_spec() == json.loads(json.dumps(SPEC)), \
        "kpi-core.js is out of date — run py scripts/sync_kpi_spec.py"


def test_field_types_are_supported_by_both_ports():
    supported = {"num", "int", "date", "str"}
    for ks in SPEC["kinds"]:
        for target, f in ks["fields"].items():
            assert f["type"] in supported, (ks["kind"], target, f["type"])
            assert f["aliases"], (ks["kind"], target)


def test_signals_exist_as_fields():
    for ks in SPEC["kinds"]:
        for s in ks["signals"]:
            assert s in ks["fields"], (ks["kind"], s)


def test_aliases_are_unique_within_a_kind():
    # Two fields claiming the same header would make extraction order-dependent.
    for ks in SPEC["kinds"]:
        seen = {}
        for target, f in ks["fields"].items():
            for a in f["aliases"]:
                key = " ".join(a.split()).lower()
                assert key not in seen, (ks["kind"], a, seen.get(key), target)
                seen[key] = target


def test_core_labels_every_field():
    # A field with no entry in FIELD_LABELS would render as a raw camelCase key
    # in the builder's "matched" line, the per-unit detail panel and the CSV header.
    m = re.search(r"const FIELD_LABELS = \{(.*?)\n\};", core_src(), re.DOTALL)
    assert m, "FIELD_LABELS not found in kpi-core.js"
    labelled = set(re.findall(r"(\w+)\s*:", m.group(1)))
    for ks in SPEC["kinds"]:
        for target in list(ks["fields"]) + list(ks.get("unitFields", {})):
            assert target in labelled, ks["kind"] + "." + target + " has no FIELD_LABELS entry"


def test_modes_are_known():
    # record  = one row per unit
    # events  = a status timeline
    # ledger  = cost lines, kept line by line
    # buckets = many lines per unit, summed into calendar months
    # Both ports switch on this, so an unknown mode would silently extract nothing.
    for ks in SPEC["kinds"]:
        assert ks.get("mode") in ("record", "events", "ledger", "buckets"), \
            (ks["kind"], ks.get("mode"))


def test_bucket_families_declare_their_bucket_fields():
    for ks in SPEC["kinds"]:
        if ks.get("mode") != "buckets":
            continue
        assert ks["fields"][ks["bucketDateField"]]["type"] == "date", \
            ks["kind"] + ": the bucket date must be a date to bucket by month"
        assert ks["bucketSumFields"], ks["kind"] + ": nothing to sum"
        for f in ks["bucketSumFields"]:
            assert ks["fields"][f]["type"] == "num", (ks["kind"], f, "must be numeric to sum")
        cf = ks.get("bucketCountField")
        if cf:
            assert cf in ks["fields"], (ks["kind"], cf)


def test_no_family_extracts_employee_names():
    """Named individuals stay out of a publicly readable data file.

    The damage report's Transaction Originator and the hours export's Foreman are
    both employee names that drive no KPI. Enabling either would be one alias
    line, so this asserts nobody adds one by accident.
    """
    banned = ("originator", "foreman", "employee name", "operator name",
              "requested by", "entered by")
    for ks in SPEC["kinds"]:
        for target, f in ks["fields"].items():
            for a in f["aliases"]:
                low = " ".join(a.split()).lower()
                assert not any(b in low for b in banned), \
                    ks["kind"] + "." + target + " would extract employee names: " + a


def test_ledger_families_declare_their_line_fields():
    for ks in SPEC["kinds"]:
        if ks.get("mode") != "ledger":
            continue
        for key in ("lineDateField", "lineAmountField", "lineDocField"):
            assert ks.get(key) in ks["fields"], (ks["kind"], key)
        assert ks["fields"][ks["lineAmountField"]]["type"] == "num", \
            ks["kind"] + ": the amount must be numeric to be summable"
        assert ks["fields"][ks["lineDateField"]]["type"] == "date", \
            ks["kind"] + ": the line date must be a date to bucket by month"


def test_event_families_declare_their_timeline_fields():
    # The timeline builder (both ports) reads these by name.
    for ks in SPEC["kinds"]:
        if ks.get("mode") != "events":
            continue
        for key in ("eventDateField", "eventStatusField"):
            assert ks.get(key) in ks["fields"], (ks["kind"], key)
        bf = ks.get("backfillField")
        assert bf and bf.get("aliases") and bf.get("values"), \
            ks["kind"] + " needs backfillField to spot the initial-load snapshot"


def test_as_of_field_is_a_real_date_field():
    for ks in SPEC["kinds"]:
        f = ks.get("asOfField")
        if not f:
            continue                      # a report with no run-date column has no as-of
        assert ks["fields"][f]["type"] == "date", (ks["kind"], f)


def test_the_hours_export_never_lands_in_the_transfer_family():
    """The real EquipmentDetailGrid export, and the mis-detection that mattered.

    Its group-header row carries "Date" — one transfer signal — and "Equipment",
    a unit alias. One hit used to be enough, so the file was detected as the
    transfer report; publishing replaces a whole family, so it would have wiped
    the real status history. What it must never be is `transfers`.
    """
    group = ["Equipment", "", "Date", "Job", "Foreman", "Cost Code", "Hours by Rate", "", ""]
    sub = ["Code", "Description", "", "Code", "Name", "Code",
           "Total (Rate 1)", "Ownership (Rate 2)", "Operating (Rate 3)"]
    assert detect_kind(group, "EquipmentDetailGrid_1.xlsx") != "transfers"
    # A transfer-ish filename must not drag it there either: a hint is a
    # tie-break, worth less than a signal.
    assert detect_kind(group, "Equipment_Transfer_hours.xlsx") != "transfers"
    # The sub-header row on its own has no unit column, so it is nothing.
    assert detect_kind(sub, "EquipmentDetailGrid_1.xlsx") is None
    # Read together — which is what find_header does — the two rows are a real
    # header and detect as the hours family.
    assert detect_kind(merge_header([group, sub]), "EquipmentDetailGrid_1.xlsx") == "hours"


def test_one_signal_is_never_enough_for_any_family():
    # "Effective Date" is a signal for transfers, damage and hours alike, so a
    # header carrying only it must claim none of them.
    assert detect_kind(["Unit Number", "Effective Date"], "x.xlsx") is None
    assert detect_kind(["Unit Number", "Vendor"], "anniversary.xlsx") is None
    assert detect_kind(["Unit Number", "Rate Group"], "rates.xlsx") is None
    # Without a unit or serial there is nothing to attach records to.
    assert detect_kind(["Current Status", "Previous Status", "Effective Date"], "x.xlsx") is None


def test_every_family_can_still_clear_the_signal_floor():
    # A floor above a family's own signal count would make it undetectable.
    floor = SPEC["minSignals"]
    assert floor >= 2, "one incidental column must never be enough"
    for ks in SPEC["kinds"]:
        assert len(ks["signals"]) >= floor, \
            ks["kind"] + " has fewer signals than minSignals, so it can never be detected"


def test_status_codes_cover_the_derived_sets():
    labels = SPEC["statusLabels"]
    for key in ("downStatuses", "workingStatuses", "excludeFromAvailability"):
        for code in SPEC[key]:
            assert code in labels, key + " references an unlabelled status: " + code
    assert not (set(SPEC["downStatuses"]) & set(SPEC["excludeFromAvailability"])), \
        "a status cannot be both downtime and excluded from availability"
