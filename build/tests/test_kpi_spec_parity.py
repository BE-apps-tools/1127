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
    # in the per-unit detail panel.
    src = page_src()
    m = re.search(r"const FIELD_LABELS = \{(.*?)\n\};", src, re.DOTALL)
    assert m, "FIELD_LABELS not found in kpis.html"
    labelled = set(re.findall(r"(\w+)\s*:", m.group(1)))
    for ks in SPEC["kinds"]:
        for target in ks["fields"]:
            assert target in labelled, ks["kind"] + "." + target + " has no FIELD_LABELS entry"
