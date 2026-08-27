#!/usr/bin/env python3
"""Copy build/kpi_reports.py's SPEC into kpis.html.

The Action build and the in-browser importer must extract identical records from
a KPI report, so the header-alias spec lives in Python and is mirrored verbatim
into the page between the KPI-REPORT-SPEC markers. Run this after touching SPEC
(adding a real vendor header, say); build/tests/test_kpi_spec_parity.py fails if
the two ever drift.

Usage: py scripts/sync_kpi_spec.py [kpis.html]
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from build.kpi_reports import spec_json  # noqa: E402

START = "/* KPI-REPORT-SPEC-START */"
END = "/* KPI-REPORT-SPEC-END */"


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "kpis.html"
    src = open(path, encoding="utf-8").read()
    block = START + "\nconst KPI_SPEC = " + spec_json() + ";\n" + END
    new, n = re.subn(re.escape(START) + r".*?" + re.escape(END), lambda _: block, src, flags=re.DOTALL)
    if n != 1:
        raise SystemExit("expected exactly 1 KPI-REPORT-SPEC block in %s, found %d" % (path, n))
    if new == src:
        print("already in sync:", path)
        return
    open(path, "w", encoding="utf-8").write(new)
    print("updated", path)


if __name__ == "__main__":
    main()
