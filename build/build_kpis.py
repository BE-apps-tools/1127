"""Build data/kpis.json from the KPI report exports in source/ (stdlib only).

Scans every ``source/*.xlsx`` that isn't the Equipment Master, detects each
file's report family from its headers, and merges the extracted per-unit facts
into ``data/kpis.json`` — replacing only the families it found files for, so
reports published through the browser importer survive an Action build (and
vice versa).

Unrecognised files are reported and skipped, never fatal: the Equipment Master
build must not break because someone parked a spreadsheet in source/.
"""
import json
import os

from .kpi_reports import merge, read_report, report_files


def build(source_dir, out_dir):
    existing = {}
    path = os.path.join(out_dir, "kpis.json")
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                existing = json.load(f)
        except (ValueError, OSError):
            existing = {}                      # corrupt file: rebuild from scratch

    extracted, skipped = [], []
    for f in report_files(source_dir):
        try:
            ex = read_report(f)
        except (ValueError, KeyError, OSError) as e:
            skipped.append({"file": os.path.basename(f), "reason": str(e)[:200]})
            continue
        if ex is None:
            skipped.append({"file": os.path.basename(f),
                            "reason": "no recognised KPI report columns"})
            continue
        extracted.append(ex)

    bundle = merge(existing, extracted)
    bundle["builtAt"] = os.environ.get("BUILD_TS", "") or bundle.get("builtAt", "")
    if skipped:
        bundle["skipped"] = skipped
    else:
        bundle.pop("skipped", None)

    os.makedirs(out_dir, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f)
    return {"reports": [r["kind"] for r in bundle["reports"]],
            "units": len(bundle["units"]), "skipped": skipped}


if __name__ == "__main__":
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else "source"
    out = sys.argv[2] if len(sys.argv) > 2 else "data"
    print(json.dumps(build(src, out)))
