"""Regenerate build/tests/fixtures/kpi_expected.json — the extraction golden file.

It holds Python's extraction of each KPI fixture. Two tests hold both import
paths to it:

  * ``test_build_kpis.py::test_matches_the_golden`` — the Python adapters
  * ``worker/tests/kpi_pipeline.test.mjs`` — the browser pipeline in kpis.html

so a change to either port that alters what gets extracted fails until the
golden is regenerated deliberately and the diff reviewed. That diff is the
review artefact: it shows exactly what every future import would now produce.

Usage: py build/tests/make_golden.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from build.kpi_reports import read_report  # noqa: E402

FIXTURES = ["kpi_rates_mini.xlsx", "kpi_rental_mini.xlsx", "kpi_transfers_mini.xlsx",
            "kpi_damage_mini.xlsx", "kpi_util_mini.xlsx"]
COMMENT = (
    "Python's extraction of each fixture (build/kpi_reports.read_report). "
    "worker/tests/kpi_pipeline.test.mjs runs the browser pipeline in kpis.html over the same "
    "fixtures and asserts it produces exactly this. Regenerate deliberately with "
    "py build/tests/make_golden.py and review the diff — a change here is a change to what "
    "both import paths extract."
)


def build():
    fx = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
    out = {"_comment": COMMENT, "fixtures": {}}
    for name in FIXTURES:
        ex = read_report(os.path.join(fx, name))
        report = dict(ex["report"])
        report.pop("importedAt", None)      # stamped at run time, not part of extraction
        out["fixtures"][name] = {"report": report, "units": ex["units"]}
    return fx, out


def main():
    fx, out = build()
    path = os.path.join(fx, "kpi_expected.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, sort_keys=True)
        fh.write("\n")
    print("wrote", path)
    for name, d in out["fixtures"].items():
        r = d["report"]
        print(f"  {name:26} {r['kind']:11} rows={r['rows']} units={r['units']}")


if __name__ == "__main__":
    main()
