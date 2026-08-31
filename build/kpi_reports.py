"""Asset-KPI report adapters — the spec that turns the JDE equipment exports into
the per-unit blocks in ``data/kpis.json``.

Four report families feed the Asset KPIs page on top of the Equipment Master:

  * ``rates``        Equipment Rates — the internal charge-out rate per unit
                     (monthly billing rate, hourly rate and its cost components).
                     Drives monthly spend, yearly spend, $/hr, maintenance share.
  * ``rental``       Anniversary Date — vendor rental contracts (vendor, PO, rate,
                     billed-through date, contract days). Drives the external
                     rental commitment and renewal/off-rent timing.
  * ``transfers``    Equipment Transfer — an **event log**, not one row per unit:
                     every status change (``Previous Status`` -> ``Current Status``)
                     with its effective date. Drives downtime, MTTR, availability,
                     repeat offenders, arrivals and equipment class.
  * ``utilization``  hour-meter / idle-vs-working hours, for the weekly
                     under-utilization export.

A report is recognised by its **headers**, not its filename: it needs a unit (or
serial) column plus at least one of the family's signal columns, and the header
row is found by scanning the first rows (these exports put a title above it).
Filenames only break ties. So an export can be dropped in as-is, and a column
reordered upstream changes nothing.

``SPEC`` below is pure data and is mirrored verbatim into ``kpis.html`` (between
the ``KPI-REPORT-SPEC`` markers) so the browser importer and the Action build
extract identical records; ``build/tests/test_kpi_spec_parity.py`` fails if the
two drift. To teach both paths a new column spelling, add it to the right alias
list and run ``py scripts/sync_kpi_spec.py``.

Only raw facts are stored. Every derived metric (downtime days, MTTR,
availability, yearly spend, cost while down, days to anniversary) is computed by
the page, so a single implementation decides what the numbers mean and nothing
time-relative can go stale in the committed file.
"""
import json
import os
import re
from datetime import date, timedelta

from .xlsx_read import norm_header, sheet_rows

# Columns that identify the asset a row belongs to. Unit # is the join key to
# the Equipment Master; serial is the fallback for exports that carry only a
# serial/VIN.
UNIT_ALIASES = ["Unit Number", "Unit #", "Unit", "Unit No", "Unit Nbr",
                "Equipment Number", "Equipment #", "Equipment", "Equip Number",
                "Equip #", "Asset Number", "Asset #"]
SERIAL_ALIASES = ["Serial Number", "Serial #", "Serial", "Serial No", "VIN"]

# Columns naming the jobsite a row belongs to. Used only to stamp the report with
# the site it covers, so the page can say when a report is for somewhere else.
SITE_ALIASES = ["Project Number", "Project Transferred To", "Location",
                "Branch/Plant", "Project", "Job Number"]

# Rows to scan for the header (JDE exports put a report title and/or the project
# name above it — Equipment Rates has four such rows).
HEADER_SCAN = 12

# Excel dates past this are data errors, not dates (one Anniversary export
# carries a 2169 "billed through"). Kept out of the JSON rather than shown.
MAX_YEAR = 2099

SPEC = {
    "unitAliases": UNIT_ALIASES,
    "serialAliases": SERIAL_ALIASES,
    "siteAliases": SITE_ALIASES,
    "headerScan": HEADER_SCAN,
    "maxYear": MAX_YEAR,
    # Equipment status codes, as the Equipment Master spells them out. DOWN is
    # what downtime is measured over; UNAVAILABLE is not working but not broken,
    # so it is excluded from availability rather than counted as downtime.
    "statusLabels": {
        "WK": "Working", "AV": "Available", "AC": "Available but Consigned",
        "DN": "Down", "DS": "Down - In Shop", "NR": "Not Ready",
        "MS": "Missing/stolen", "LG": "Legal Hold",
    },
    "downStatuses": ["DN", "DS"],
    "workingStatuses": ["WK"],
    "excludeFromAvailability": ["MS", "LG"],
    "kinds": [
        {
            "kind": "rates",
            "label": "Equipment rates (charge-out)",
            "mode": "record",
            "hints": ["rate", "rates", "equipment rates", "charge", "billing"],
            "signals": ["monthlyBillingRate", "monthlyOwnership", "rateGroup",
                        "monthlyNonHourlyOwnership", "hourlyBillingRate"],
            "fields": {
                "monthlyBillingRate": {"type": "num", "aliases": [
                    "Monthly Billing Rate", "Monthly Rate", "Monthly Charge"]},
                "monthlyOwnership": {"type": "num", "aliases": ["Monthly Ownership"]},
                "monthlyNonHourlyOwnership": {"type": "num", "aliases": [
                    "Monthly Non-Hourly Ownership", "Monthly Non Hourly Ownership"]},
                "hourlyBillingRate": {"type": "num", "aliases": [
                    "Hourly Billing Rate", "Hourly Rate", "Rate Per Hour"]},
                "billingType": {"type": "str", "aliases": ["Billing Type"]},
                "rateGroup": {"type": "str", "aliases": ["Rate Group"]},
                "rateGroupDesc": {"type": "str", "aliases": [
                    "Rate Group Description", "Rate Description"]},
                "ownershipComponent": {"type": "num", "aliases": [
                    "Ownership Component", "Ownership"]},
                "pmComponent": {"type": "num", "aliases": [
                    "Preventative Maintenance", "Preventive Maintenance", "PM"]},
                "repairComponent": {"type": "num", "aliases": [
                    "Corrective Repair", "Repair"]},
                "tiresComponent": {"type": "num", "aliases": [
                    "Tires / U.C.", "Tires / UC", "Tires", "Tires/U.C."]},
                "oilComponent": {"type": "num", "aliases": [
                    "Oil / Grease", "Oil/Grease", "Oil & Grease"]},
                "getComponent": {"type": "num", "aliases": ["GET"]},
                "rateBegin": {"type": "date", "aliases": ["Begin Date", "Effective From"]},
                "rateEnd": {"type": "date", "aliases": ["End Date", "Effective To"]},
                "projectNumber": {"type": "str", "aliases": [
                    "Project Number", "Project", "Job Number"]},
            },
        },
        {
            "kind": "rental",
            "label": "Rental contracts (anniversary)",
            "mode": "record",
            "hints": ["anniversary", "rental", "rent", "contract", "vendor"],
            "signals": ["billedThroughDate", "totalNonHourlyRate", "bareRentalRate",
                        "monthlyNonHourlyRate", "vendor", "contractDays"],
            "fields": {
                "vendor": {"type": "str", "aliases": [
                    "Vendor", "Supplier", "Rental Vendor", "Lessor"]},
                "po": {"type": "str", "aliases": [
                    "PO#", "PO #", "PO Number", "Purchase Order"]},
                "acquiredDate": {"type": "date", "aliases": [
                    "Acquired Date", "Acquisition Date", "Start Date"]},
                "billedThroughDate": {"type": "date", "aliases": [
                    "Billed Through Date", "Billed Through", "Anniversary Date",
                    "Next Billing Date"]},
                "contractDays": {"type": "int", "aliases": [
                    "Contract Days", "Billing Cycle Days", "Cycle Days"]},
                "billingType": {"type": "str", "aliases": ["Billing Type"]},
                "hourlyRate": {"type": "num", "aliases": [
                    "Total Hourly Rate", "Hourly Rental Rate"]},
                "monthlyNonHourlyRate": {"type": "num", "aliases": [
                    "Monthly Non-Hourly Rate", "Monthly Non Hourly Rate"]},
                "bareRentalRate": {"type": "num", "aliases": [
                    "Bare Rental Rate", "Bare Rate"]},
                "totalNonHourlyRate": {"type": "num", "aliases": [
                    "Total Non-Hourly Rate", "Total Non Hourly Rate",
                    "Total Monthly Rate"]},
                "eqStatus": {"type": "str", "aliases": [
                    "EQ St", "EQ Status", "Equipment Status"]},
            },
        },
        {
            "kind": "transfers",
            "label": "Transfer / status history",
            "mode": "events",
            "hints": ["transfer", "status", "history", "movement"],
            "signals": ["status", "prev", "date", "from"],
            # Event fields land in each entry of the unit's `events` array.
            "fields": {
                "date": {"type": "date", "aliases": [
                    "Effective Date", "Transfer Date", "Date"]},
                "status": {"type": "str", "aliases": [
                    "Current Status", "New Status", "To Status"]},
                "prev": {"type": "str", "aliases": [
                    "Previous Status", "Prior Status", "From Status"]},
                "from": {"type": "str", "aliases": [
                    "Project Transferred From", "Transferred From", "From Project"]},
                "remark": {"type": "str", "aliases": [
                    "Request Remark", "Remark", "Comment", "Reason"]},
            },
            # Not part of the timeline: read off the newest event onto the unit.
            "unitFields": {
                "eqClass": {"type": "str", "aliases": [
                    "Major Equipment Class", "Equipment Class", "Class"]},
                "transferTrade": {"type": "str", "aliases": ["Current Trade"]},
            },
            # Rows whose "transfer status" is one of these are JDE's initial-load
            # snapshot, not a real state change (see `_timeline`).
            "backfillField": {"aliases": [
                "Transfer Status", "Status of Transfer"], "values": ["Newly Acquired"]},
            "eventDateField": "date",
            "eventStatusField": "status",
            "asOfField": "date",
        },
        {
            "kind": "utilization",
            "label": "Utilization / hour meter",
            "mode": "record",
            "hints": ["utilization", "utilisation", "hour meter", "hourmeter",
                      "zero hours", "telematics", "hours"],
            "signals": ["meterHours", "engineHours", "idleHours", "workHours", "periodHours"],
            "fields": {
                "meterHours": {"type": "num", "aliases": [
                    "Hour Meter", "Hour Meter Reading", "Meter Reading",
                    "Current Meter Reading", "Current Hours", "Hours"]},
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
                    "Hours (Period)", "Reported Hours"]},
                "targetHours": {"type": "num", "aliases": [
                    "Target Hours", "Utilization Target", "Target Utilization"]},
            },
            "asOfField": "meterDate",
        },
    ],
}

KINDS = [k["kind"] for k in SPEC["kinds"]]
DOWN = set(SPEC["downStatuses"])


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


def _guard_year(iso):
    """Drop dates past MAX_YEAR — a JDE sentinel/typo, never a real date."""
    return "" if (iso and int(iso[:4]) > MAX_YEAR) else iso


def coerce_date(v):
    """Excel serial, ISO, or M/D/YYYY -> ISO YYYY-MM-DD. Unparseable -> ''."""
    s = str("" if v is None else v).strip()
    if not s:
        return ""
    m = _ISO_RE.match(s)
    if m:
        try:
            return _guard_year(date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat())
        except ValueError:
            return ""
    m = _US_RE.match(s)
    if m:
        mo, dy, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yr < 100:
            yr += 2000
        try:
            return _guard_year(date(yr, mo, dy).isoformat())
        except ValueError:
            return ""
    if re.fullmatch(r"\d+(\.\d+)?", s):
        n = int(float(s))
        if n <= 0:
            return ""
        try:
            # 1899-12-30 base absorbs Excel's 1900 leap-year bug (as normalize.py does)
            return _guard_year((date(1899, 12, 30) + timedelta(days=n)).isoformat())
        except (OverflowError, ValueError):
            return ""
    return ""


_COERCE = {"num": coerce_num, "int": coerce_int, "date": coerce_date,
           "str": lambda v: str("" if v is None else v).strip()}


# ---------------------------------------------------------------- headers
def _find(norm, aliases):
    for want in aliases:
        w = norm_header(want).lower()
        if w in norm:
            return norm.index(w)
    return None


def find_header(rows, scan=HEADER_SCAN):
    """Index of the header row in the first `scan` rows, by best alias match.

    These exports carry a report title (and sometimes the project name) above the
    header, so row 0 is not the header. Scores each candidate row by how many of
    every family's aliases it contains.
    """
    wanted = [UNIT_ALIASES, SERIAL_ALIASES]
    for ks in SPEC["kinds"]:
        for f in ks["fields"].values():
            wanted.append(f["aliases"])
        for f in ks.get("unitFields", {}).values():
            wanted.append(f["aliases"])
    best, best_score = 0, 0
    for i, row in enumerate(rows[:scan]):
        norm = [norm_header(h).lower() for h in row]
        if not any(norm):
            continue
        score = sum(1 for aliases in wanted if _find(norm, aliases) is not None)
        if score > best_score:
            best, best_score = i, score
    return best


def map_headers(header, kind):
    """{unit, serial, cols:{target: index}} for one kind, matched on the
    normalized lower-cased header (so 'Unit\\nNumber' and 'unit number' agree).

    First alias wins, and the first column with that name wins — these exports
    repeat 'Description' for a second, unrelated column.
    """
    ks = kind_spec(kind)
    norm = [norm_header(h).lower() for h in header]
    cols = {t: i for t, f in ks["fields"].items()
            if (i := _find(norm, f["aliases"])) is not None}
    unit_cols = {t: i for t, f in ks.get("unitFields", {}).items()
                 if (i := _find(norm, f["aliases"])) is not None}
    bf = ks.get("backfillField")
    return {"unit": _find(norm, UNIT_ALIASES), "serial": _find(norm, SERIAL_ALIASES),
            "site": _find(norm, SITE_ALIASES), "cols": cols, "unitCols": unit_cols,
            "backfill": _find(norm, bf["aliases"]) if bf else None}


def detect_kind(header, filename=""):
    """Best-matching report family for a header row, or None.

    Scored by how many of the family's signal columns are present; a filename
    hint only breaks ties.
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


def report_site(rows, header_row, site_col=None):
    """The jobsite this report covers, so the page can warn when it's for another.

    Prefers a title above the header (Equipment Rates names itself
    '36620001127 - NEER High Spring Slr, OK'); otherwise the most common value in
    the report's own site column (Anniversary Date carries 'Location').
    """
    for row in rows[:header_row]:
        for cell in row:
            m = re.search(r"\b(\d{9,13})\b", str(cell or ""))
            if m:
                return m.group(1)
    if site_col is None:
        return ""
    counts = {}
    for arr in rows[header_row + 1:]:
        v = str(arr[site_col] or "").strip() if site_col < len(arr) else ""
        if re.fullmatch(r"\d{9,13}", v):
            counts[v] = counts.get(v, 0) + 1
    return max(counts, key=counts.get) if counts else ""


# ---------------------------------------------------------------- timeline
def _timeline(events):
    """Clean one unit's status events into a timeline (oldest first).

    Two artifacts of the JDE export are handled here, because both would
    otherwise invent downtime:

    * **Initial-load blocks.** A "Newly Acquired" row has no previous status. When
      several share one date they are JDE's snapshot of the asset — the sample
      set repeats each of the unit's later remarks as its own row — so they can't
      all be real state changes. The block collapses to a single arrival marker
      with an unknown status (''), which the page counts as neither up nor down.
    * **Same-day changes.** Otherwise, one event per date: the last one wins,
      which is the unit's state at the end of that day.
    """
    by_date = {}
    for e in events:
        d = e.get("date") or ""
        if d:
            by_date.setdefault(d, []).append(e)
    out = []
    for d in sorted(by_date):
        group = by_date[d]
        snapshots = [e for e in group if e.get("_backfill")]
        if len(group) > 1 and len(snapshots) == len(group):
            out.append({"date": d, "status": "", "arrival": True})
            continue
        # Prefer a real transition over a snapshot row on the same date; of the
        # rest, the last row is the unit's state at the end of that day.
        pool = [e for e in group if not e.get("_backfill")] or group
        keep = pool[-1]
        ev = {"date": d, "status": keep.get("status", "") or ""}
        for k in ("prev", "from", "remark"):
            if keep.get(k):
                ev[k] = keep[k]
        if keep.get("_backfill"):
            ev["arrival"] = True
        out.append(ev)
    return out


def extract(rows, kind, filename=""):
    """Rows -> {"units": {key: block}, "report": {...}} for one report family.

    Keys are the unit number, or ``SN:<serial>`` when a row carries only a
    serial — the page joins on either.
    """
    rows = list(rows)
    if not rows:
        raise ValueError("Sheet is empty")
    hi = find_header(rows, SPEC["headerScan"])
    header = [norm_header(h) for h in rows[hi]]
    m = map_headers(header, kind)
    if m["unit"] is None and m["serial"] is None:
        raise ValueError("No unit or serial column found. Headers: "
                         + ", ".join(h for h in header if h)[:200])
    if not m["cols"]:
        raise ValueError("No recognised " + kind + " columns. Headers: "
                         + ", ".join(h for h in header if h)[:200])
    ks = kind_spec(kind)
    events_mode = ks.get("mode") == "events"
    bf_values = set((ks.get("backfillField") or {}).get("values", []))
    as_of_field = ks.get("asOfField")
    units, dates, row_count = {}, [], 0

    for arr in rows[hi + 1:]:
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
            if target == as_of_field:
                dates.append(val)
        if not rec:
            continue
        row_count += 1
        blk = units.setdefault(key, {})
        if serial and not blk.get("serial"):
            blk["serial"] = serial
        for target, ci in m["unitCols"].items():
            val = _COERCE[ks["unitFields"][target]["type"]](cell(ci))
            if val:
                blk[target] = val                      # newest row wins
        if events_mode:
            if not rec.get(ks["eventDateField"]):
                continue                               # an undated row is not an event
            rec["_backfill"] = (m["backfill"] is not None
                                and str(cell(m["backfill"]) or "").strip() in bf_values)
            blk.setdefault("_events", []).append(rec)
        else:
            # Last row wins on duplicate units (exports list the newest last),
            # but never blank out a field an earlier row filled.
            blk.update(rec)

    if events_mode:
        total = 0
        for key, blk in list(units.items()):
            tl = _timeline(blk.pop("_events", []))
            if not tl:
                del units[key]
                continue
            blk["events"] = tl
            total += len(tl)
        row_count = total                              # report the timeline, not raw rows

    # "As of" is when the data was true. Only a backward-looking field counts
    # (`asOfField`) — these exports also carry future rate-end and billed-through
    # dates, and a report with no such field simply has no as-of.
    today = date.today().isoformat()
    past = [d for d in dates if d <= today]
    report = {
        "kind": kind, "label": ks["label"], "file": os.path.basename(filename or ""),
        "rows": row_count, "units": len(units),
        "asOf": max(past) if past else "",
        "site": report_site(rows, hi, m["site"]),
        "columns": sorted(m["cols"].keys()),
    }
    return {"units": units, "report": report}


def merge(existing, extracted):
    """Fold extracted report blocks into a kpis.json bundle, per family.

    Importing an Equipment Rates export replaces every unit's ``rates`` block and
    leaves ``rental``/``transfers``/``utilization`` untouched — so the Action
    build and the browser importer can each own different reports without
    clobbering the other. ``extracted`` is a list of ``extract()`` results.
    """
    bundle = existing if isinstance(existing, dict) else {}
    units = dict(bundle.get("units") or {})
    reports = [r for r in (bundle.get("reports") or []) if isinstance(r, dict)]
    for ex in extracted:
        kind = ex["report"]["kind"]
        for key in list(units.keys()):                     # drop this family everywhere
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
    """Detect the family of one xlsx and extract it. None if unrecognised."""
    rows = list(sheet_rows(path))
    if not rows:
        return None
    hi = find_header(rows, SPEC["headerScan"])
    kind = detect_kind([norm_header(h) for h in rows[hi]], path)
    if not kind:
        return None
    return extract(rows, kind, path)
