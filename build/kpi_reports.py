"""Asset-KPI report adapters — the spec that turns third-party Excel exports
into the per-unit blocks in ``data/kpis.json``.

Three report families feed the Asset KPIs page on top of the Equipment Master:

  * ``utilization``  — hour-meter / idle-vs-working hours
  * ``maintenance``  — PM due, open work orders, downtime
  * ``cost``         — monthly rate, cost to date, fuel

A report is recognised by its **headers**, not its filename: it needs a unit (or
serial) column plus at least one of the family's signal columns. Filenames only
break ties. That means an admin can drop a report in without renaming it, and a
column reordered upstream changes nothing.

``SPEC`` below is pure data and is mirrored verbatim into ``kpis.html`` (between
the ``KPI-REPORT-SPEC`` markers) so the browser importer and the Action build
extract identical records; ``build/tests/test_kpi_spec_parity.py`` fails if the
two drift. Header aliases are best-effort guesses at each vendor's spelling —
add the real header to the right alias list when a new export shows up, and both
ingest paths pick it up at once.

Only raw facts are stored. Every derived metric (utilisation %, PM overdue,
cost/hour, idle exposure) is computed by the page, so a single implementation
decides what the numbers mean and time-relative values are never stale.
"""
import json
import os
import re
from datetime import date, timedelta

from .xlsx_read import norm_header, sheet_rows

# Columns that identify the asset a row belongs to. Unit # is the join key to
# the Equipment Master; serial is the fallback for telematics-style exports
# that only carry a VIN/serial.
UNIT_ALIASES = ["Unit Number", "Unit #", "Unit", "Unit No", "Unit Nbr",
                "Equipment Number", "Equipment #", "Equipment", "Equip Number",
                "Equip #", "Asset Number", "Asset #"]
SERIAL_ALIASES = ["Serial Number", "Serial #", "Serial", "Serial No", "VIN"]

SPEC = {
    "unitAliases": UNIT_ALIASES,
    "serialAliases": SERIAL_ALIASES,
    "kinds": [
        {
            "kind": "utilization",
            "label": "Utilization / hour meter",
            "hints": ["utilization", "utilisation", "hour meter", "hourmeter",
                      "meter", "telematics", "hours"],
            "signals": ["meterHours", "engineHours", "idleHours", "workHours", "periodHours"],
            "fields": {
                "meterHours": {"type": "num", "aliases": [
                    "Hour Meter", "Hour Meter Reading", "Meter Reading", "Meter",
                    "Current Hours", "Current Meter", "Hours"]},
                "meterDate": {"type": "date", "aliases": [
                    "Meter Date", "Reading Date", "Meter Reading Date", "As Of", "As Of Date"]},
                "engineHours": {"type": "num", "aliases": [
                    "Engine Hours", "Total Hours", "Total Engine Hours", "Run Hours"]},
                "idleHours": {"type": "num", "aliases": [
                    "Idle Hours", "Idling Hours", "Idle Time", "Idle"]},
                "workHours": {"type": "num", "aliases": [
                    "Working Hours", "Work Hours", "Productive Hours", "Operating Hours"]},
                "periodHours": {"type": "num", "aliases": [
                    "Period Hours", "Hours This Period", "Monthly Hours", "Hours Used",
                    "Hours (Period)"]},
                "targetHours": {"type": "num", "aliases": [
                    "Target Hours", "Utilization Target", "Target Utilization"]},
            },
        },
        {
            "kind": "maintenance",
            "label": "Maintenance / PM / work orders",
            "hints": ["maintenance", "pm", "preventive", "work order", "workorder",
                      "service", "wo"],
            "signals": ["pmDueDate", "pmDueHours", "openWo", "downDays",
                        "lastServiceDate", "maintStatus"],
            "fields": {
                "pmDueDate": {"type": "date", "aliases": [
                    "PM Due", "PM Due Date", "Next PM", "Next PM Date", "Next Service",
                    "Next Service Date", "Service Due", "Service Due Date"]},
                "pmDueHours": {"type": "num", "aliases": [
                    "PM Due Hours", "Hours To PM", "Next Service Hours", "Service Due Hours"]},
                "lastServiceDate": {"type": "date", "aliases": [
                    "Last Service", "Last Service Date", "Last PM", "Last PM Date",
                    "Last Serviced"]},
                "openWo": {"type": "int", "aliases": [
                    "Open Work Orders", "Open WO", "Open WOs", "WO Count",
                    "Work Orders Open", "Open Orders"]},
                "downDays": {"type": "num", "aliases": [
                    "Down Days", "Downtime Days", "Days Down", "Downtime (Days)"]},
                "maintStatus": {"type": "str", "aliases": [
                    "Maintenance Status", "PM Status", "Service Status", "Condition"]},
                "lastWo": {"type": "str", "aliases": [
                    "Work Order", "Work Order #", "WO #", "Last Work Order"]},
            },
        },
        {
            "kind": "cost",
            "label": "Cost / rental / fuel",
            "hints": ["cost", "rental", "rent", "fuel", "rate", "billing", "spend"],
            "signals": ["monthlyCost", "costToDate", "ratePerHour", "fuelGal", "fuelCost"],
            "fields": {
                "monthlyCost": {"type": "num", "aliases": [
                    "Monthly Cost", "Monthly Rate", "Monthly Rental", "Rental Rate",
                    "Rate Per Month", "Month Rate", "Monthly Charge"]},
                "costToDate": {"type": "num", "aliases": [
                    "Cost To Date", "Job To Date", "JTD Cost", "YTD Cost", "Total Cost",
                    "Cost YTD"]},
                "ratePerHour": {"type": "num", "aliases": [
                    "Cost Per Hour", "Hourly Rate", "Rate Per Hour", "Rate/Hr", "Cost/Hr"]},
                "fuelGal": {"type": "num", "aliases": [
                    "Fuel Gallons", "Fuel (gal)", "Gallons", "Gallons Used", "Fuel Used",
                    "Fuel Qty"]},
                "fuelCost": {"type": "num", "aliases": [
                    "Fuel Cost", "Fuel Spend", "Fuel $"]},
                "ownership": {"type": "str", "aliases": [
                    "Ownership", "Owned/Rented", "Own Or Rent", "Rental Or Owned",
                    "Finance Method"]},
                "vendor": {"type": "str", "aliases": [
                    "Vendor", "Supplier", "Rental Vendor", "Lessor"]},
                "costPeriod": {"type": "str", "aliases": [
                    "Period", "Cost Period", "Billing Period", "Month"]},
            },
        },
    ],
}

KINDS = [k["kind"] for k in SPEC["kinds"]]


def kind_spec(kind):
    for k in SPEC["kinds"]:
        if k["kind"] == kind:
            return k
    raise KeyError(kind)


# ---------------------------------------------------------------- coercion
# Mirrored in kpis.html (kpiNum/kpiInt/kpiDate). The shared case table in
# build/tests/fixtures/kpi_coerce_cases.json is asserted against both ports.

_NUM_STRIP = re.compile(r"[$,\s]")


def coerce_num(v):
    """'$4,200.00' -> 4200.0, '83%' -> 83.0, '(120)' -> -120.0, junk -> None."""
    s = str("" if v is None else v).strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    s = _NUM_STRIP.sub("", s).rstrip("%")
    if not s or not re.fullmatch(r"-?\d*\.?\d+", s):
        return None
    n = float(s)
    if n == 0:
        return 0.0          # never emit -0.0, so both ports serialize the same
    return -n if neg else n


def coerce_int(v):
    n = coerce_num(v)
    return None if n is None else int(n)


_ISO_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_US_RE = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$")


def coerce_date(v):
    """Excel serial, ISO, or M/D/YYYY -> ISO YYYY-MM-DD. Unparseable -> ''."""
    s = str("" if v is None else v).strip()
    if not s:
        return ""
    m = _ISO_RE.match(s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
        except ValueError:
            return ""
    m = _US_RE.match(s)
    if m:
        mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yr < 100:
            yr += 2000
        try:
            return date(yr, mo, dy).isoformat()
        except ValueError:
            return ""
    if re.fullmatch(r"\d+(\.\d+)?", s):
        n = int(float(s))
        if n <= 0:
            return ""
        try:
            # 1899-12-30 base absorbs Excel's 1900 leap-year bug (as normalize.py does)
            return (date(1899, 12, 30) + timedelta(days=n)).isoformat()
        except (OverflowError, ValueError):
            return ""
    return ""


_COERCE = {"num": coerce_num, "int": coerce_int, "date": coerce_date,
           "str": lambda v: str("" if v is None else v).strip()}


def _alias_map(aliases):
    return {norm_header(a).lower(): True for a in aliases}


def map_headers(header, kind):
    """Return {target: column index} for one kind, plus the unit/serial columns.

    Matching is on the normalized, lower-cased header, so 'Unit\\nNumber' and
    'unit number' both land on the unit column.
    """
    ks = kind_spec(kind)
    norm = [norm_header(h).lower() for h in header]
    cols, unit_col, serial_col = {}, None, None
    for want in UNIT_ALIASES:
        w = norm_header(want).lower()
        if w in norm:
            unit_col = norm.index(w)
            break
    for want in SERIAL_ALIASES:
        w = norm_header(want).lower()
        if w in norm:
            serial_col = norm.index(w)
            break
    for target, f in ks["fields"].items():
        for want in f["aliases"]:
            w = norm_header(want).lower()
            if w in norm:
                cols[target] = norm.index(w)
                break
    return {"unit": unit_col, "serial": serial_col, "cols": cols}


def detect_kind(header, filename=""):
    """Best-matching report kind for a header row, or None.

    Scored by how many of the kind's signal columns are present; a filename hint
    breaks ties (so a 'Fuel' export with only one recognised column still lands
    on ``cost``).
    """
    base = os.path.basename(filename or "").lower()
    best, best_score = None, 0
    for ks in SPEC["kinds"]:
        m = map_headers(header, ks["kind"])
        if m["unit"] is None and m["serial"] is None:
            continue
        hits = sum(1 for s in ks["signals"] if s in m["cols"])
        if not hits:
            continue
        score = hits * 10 + (3 if any(h in base for h in ks["hints"]) else 0)
        if score > best_score:
            best, best_score = ks["kind"], score
    return best


def extract(rows, kind, filename=""):
    """Rows (first row = header) -> {"units": {key: {field: value}}, "report": {...}}.

    Keys are the unit number, or ``SN:<serial>`` when a row carries only a
    serial — the page joins on either.
    """
    rows = list(rows)
    if not rows:
        raise ValueError("Sheet is empty")
    header = [norm_header(h) for h in rows[0]]
    m = map_headers(header, kind)
    if m["unit"] is None and m["serial"] is None:
        raise ValueError("No unit or serial column found. Headers: "
                         + ", ".join(h for h in header if h)[:200])
    if not m["cols"]:
        raise ValueError("No recognised " + kind + " columns. Headers: "
                         + ", ".join(h for h in header if h)[:200])
    ks = kind_spec(kind)
    units, dates, row_count = {}, [], 0
    for arr in rows[1:]:
        def cell(i):
            return arr[i] if (i is not None and i < len(arr)) else ""
        unit = str(cell(m["unit"]) or "").strip()
        serial = str(cell(m["serial"]) or "").strip()
        key = unit or ("SN:" + serial if serial else "")
        if not key:
            continue
        rec = {}
        for target, ci in m["cols"].items():
            val = _COERCE[ks["fields"][target]["type"]](cell(ci))
            if val is None or val == "":
                continue
            rec[target] = val
            if ks["fields"][target]["type"] == "date":
                dates.append(val)
        if not rec:
            continue
        if serial:
            rec["serial"] = serial
        row_count += 1
        # Last row wins on duplicate units (exports often list the newest last),
        # but never blank out a field an earlier row filled.
        units.setdefault(key, {}).update(rec)
    report = {
        "kind": kind, "label": ks["label"], "file": os.path.basename(filename or ""),
        "rows": row_count, "units": len(units), "asOf": max(dates) if dates else "",
        "columns": sorted(m["cols"].keys()),
    }
    return {"units": units, "report": report}


def merge(existing, extracted):
    """Fold extracted report blocks into a kpis.json bundle, per kind.

    Importing a utilisation report replaces every unit's ``utilization`` block
    and leaves ``maintenance``/``cost`` untouched — so the Action build and the
    browser importer can each own different reports without clobbering the
    other. ``extracted`` is a list of ``extract()`` results.
    """
    bundle = existing if isinstance(existing, dict) else {}
    units = dict(bundle.get("units") or {})
    reports = [r for r in (bundle.get("reports") or []) if isinstance(r, dict)]
    for ex in extracted:
        kind = ex["report"]["kind"]
        for key in list(units.keys()):                     # drop this kind everywhere
            blk = dict(units[key])
            blk.pop(kind, None)
            units[key] = blk
        for key, raw in ex["units"].items():
            blk = dict(units.get(key) or {})
            rec = dict(raw)
            serial = rec.pop("serial", "")
            if serial and not blk.get("serial"):
                blk["serial"] = serial
            blk[kind] = rec
            units[key] = blk
        reports = [r for r in reports if r.get("kind") != kind] + [ex["report"]]
    units = {k: v for k, v in units.items()
             if any(kk in v for kk in KINDS)}              # forget units with no data left
    reports.sort(key=lambda r: KINDS.index(r["kind"]) if r.get("kind") in KINDS else 99)
    return {"builtAt": bundle.get("builtAt", ""), "reports": reports, "units": units}


def spec_json():
    """The spec as it is embedded in kpis.html (stable key order)."""
    return json.dumps(SPEC, sort_keys=True, separators=(",", ":"))


def report_files(source_dir):
    """Candidate report files in source/: every xlsx that isn't the Equipment
    Master (which build_data.py owns) and isn't an Excel lock file."""
    out = []
    for name in sorted(os.listdir(source_dir)) if os.path.isdir(source_dir) else []:
        if not name.lower().endswith(".xlsx") or name.startswith("~$"):
            continue
        if name.lower().startswith("equipment master"):
            continue
        out.append(os.path.join(source_dir, name))
    return out


def read_report(path):
    """Detect the kind of one xlsx and extract it. Returns None if unrecognised."""
    rows = list(sheet_rows(path))
    if not rows:
        return None
    kind = detect_kind([norm_header(h) for h in rows[0]], path)
    if not kind:
        return None
    return extract(rows, kind, path)
