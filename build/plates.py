"""License Plate Report reader (stdlib only).

The report is a separate JDE export, one row per unit/plate:
  Unit Number | Description | VIN Number | Plate Number | License Renewal Date | State | ...
It is joined to the Equipment Master on Unit Number and adds plate, plateState,
plateRenewal and vin to each matched asset. Mirrored in inventory.html (browser import).
"""
import glob
import os
import re
import zipfile

from .normalize import excel_serial_to_iso

# Placeholder plate text that means "no plate" rather than a plate number.
NO_PLATE = {"", "N/A", "NA", "NONE", "TBD", "-"}


def _norm(s):
    return re.sub(r"\s+", " ", (s or "").strip())


def parse_plates(header, rows):
    """header: list of header texts; rows: iterable of cell lists. -> {unit: fields}.

    A unit can appear more than once (an expired plate left on the report next to its
    replacement); the row with the latest renewal date wins, later row on a tie.
    """
    idx = {_norm(h).lower(): i for i, h in enumerate(header)}
    need = {"unit number": None, "plate number": None}
    for k in need:
        if k not in idx:
            raise ValueError("not a License Plate Report: no %r header (found: %s)"
                             % (k, ", ".join(h for h in map(_norm, header) if h)[:120]))

    def cell(r, name):
        i = idx.get(name)
        return (r[i] if i is not None and i < len(r) else "") or ""

    best = {}
    for r in rows:
        unit = str(cell(r, "unit number")).strip()
        plate = str(cell(r, "plate number")).strip()
        if not unit or plate.upper() in NO_PLATE:
            continue
        renewal = excel_serial_to_iso(cell(r, "license renewal date"))
        rec = {"plate": plate, "plateState": str(cell(r, "state")).strip(),
               "plateRenewal": renewal, "vin": str(cell(r, "vin number")).strip()}
        old = best.get(unit)
        if old is None or renewal >= old["plateRenewal"]:
            best[unit] = rec
    return best


def read_plates(path):
    from .build_data import _read_shared, _rows
    z = zipfile.ZipFile(path)
    shared = _read_shared(z)
    header, body = None, []
    # _rows pads to a fixed width; the report is narrower, so ask for what it has.
    for h, arr in _rows(z, shared, ncols=12):
        header = h
        body.append(arr)
    if header is None:
        raise ValueError("License Plate Report is empty")
    return parse_plates(header, body)


def newest_plate_source(source_dir):
    files = [f for f in glob.glob(os.path.join(source_dir, "License Plate*.xlsx"))
             if not os.path.basename(f).startswith("~$")]
    return max(files, key=os.path.getmtime) if files else None
