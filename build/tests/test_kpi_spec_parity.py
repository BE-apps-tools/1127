"""The KPI report spec must be identical in Python and in kpis.html.

The Action build (build/kpi_reports.py) and the in-browser importer both extract
records from the same spreadsheets and write to the same data/kpis.json, so a
header alias added on one side only would silently produce two different
datasets. The page embeds a verbatim copy of SPEC between the KPI-REPORT-SPEC
markers; `py scripts/sync_kpi_spec.py` regenerates it.
"""
import json
import os
import re

from build.kpi_reports import SPEC

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PAGE = os.path.join(ROOT, "kpis.html")
BLOCK_RE = re.compile(
    r"/\* KPI-REPORT-SPEC-START \*/\s*const KPI_SPEC = (\{.*?\});\s*/\* KPI-REPORT-SPEC-END \*/",
    re.DOTALL)


def page_src():
    with open(PAGE, encoding="utf-8") as f:
        return f.read()


def embedded_spec():
    m = BLOCK_RE.search(page_src())
    assert m, "no KPI-REPORT-SPEC block in kpis.html — run py scripts/sync_kpi_spec.py"
    return json.loads(m.group(1))


def test_embedded_spec_matches_python():
    assert embedded_spec() == json.loads(json.dumps(SPEC)), \
        "kpis.html is out of date — run py scripts/sync_kpi_spec.py"


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


def test_page_labels_every_field():
    # A field with no entry in FIELD_LABELS would render as a raw camelCase key
    # in the per-unit detail panel and the CSV header.
    src = page_src()
    m = re.search(r"const FIELD_LABELS = \{(.*?)\n\};", src, re.DOTALL)
    assert m, "FIELD_LABELS not found in kpis.html"
    labelled = set(re.findall(r"(\w+)\s*:", m.group(1)))
    for ks in SPEC["kinds"]:
        for target in list(ks["fields"]) + list(ks.get("unitFields", {})):
            assert target in labelled, ks["kind"] + "." + target + " has no FIELD_LABELS entry"


def test_modes_are_known():
    for ks in SPEC["kinds"]:
        assert ks.get("mode") in ("record", "events"), (ks["kind"], ks.get("mode"))


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


def test_status_codes_cover_the_derived_sets():
    labels = SPEC["statusLabels"]
    for key in ("downStatuses", "workingStatuses", "excludeFromAvailability"):
        for code in SPEC[key]:
            assert code in labels, key + " references an unlabelled status: " + code
    assert not (set(SPEC["downStatuses"]) & set(SPEC["excludeFromAvailability"])), \
        "a status cannot be both downtime and excluded from availability"
