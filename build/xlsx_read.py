"""Generic first-sheet xlsx reader (stdlib only).

`build_data.py` has its own reader pinned to the Equipment Master's fixed
20-column shape. The KPI reports are third-party exports whose column count
varies, so this module reads the first sheet as ragged rows and lets the
caller map headers by name.
"""
import re
import zipfile
from xml.etree import ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def norm_header(s):
    """Collapse whitespace (JDE headers carry embedded newlines) and trim."""
    return re.sub(r"\s+", " ", str(s or "").strip())


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for c in letters:
        n = n * 26 + (ord(c) - 64)
    return n - 1


def _read_shared(z):
    out = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si"):
            out.append("".join(t.text or "" for t in si.iter(M + "t")))
    return out


def _first_sheet_target(z):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rid = wb.find(M + "sheets").find(M + "sheet").get(R + "id")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    tgt = {r.get("Id"): r.get("Target") for r in rels}[rid]
    return tgt if tgt.startswith("xl/") else "xl/" + tgt


def sheet_rows(xlsx_path):
    """Yield the first sheet's rows as lists of strings (ragged, no column cap)."""
    z = zipfile.ZipFile(xlsx_path)
    shared = _read_shared(z)
    with z.open(_first_sheet_target(z)) as f:
        for _, row in ET.iterparse(f, events=("end",)):
            if row.tag != M + "row":
                continue
            cells, maxc = {}, -1
            for c in row.findall(M + "c"):
                ci = col_index(c.get("r"))
                if ci > maxc:
                    maxc = ci
                ty = c.get("t")
                val = ""
                if ty == "inlineStr":
                    isel = c.find(M + "is")
                    if isel is not None:
                        val = "".join(t.text or "" for t in isel.iter(M + "t"))
                else:
                    v = c.find(M + "v")
                    if v is not None:
                        val = v.text or ""
                        if ty == "s":
                            val = shared[int(val)]
                cells[ci] = val
            yield [cells.get(i, "") for i in range(maxc + 1)]
            row.clear()
