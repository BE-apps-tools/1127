"""Generate tiny .xlsx fixtures for the three KPI report families.

Mirrors make_fixture.py's hand-rolled writer (stdlib only) and deliberately
uses messy real-world values — '$4,200.00', '83%', a serial-only row, a unit
that isn't in the Equipment Master — so the adapters are tested on the shapes
they'll actually meet.

Usage: py build/tests/make_kpi_fixture.py
"""
import os
import zipfile

# (filename, sheet name, headers, rows). Cells: ("s", text) | ("n", number) | "".
FIXTURES = [
    ("kpi_util_mini.xlsx", "Utilization",
     ["Unit\nNumber", "Serial Number", "Hour Meter", "Meter Date", "Idle Hours",
      "Working Hours", "Period Hours"],
     [
         [("s", "U1"), ("s", "S1"), ("n", "5200"), ("n", "46000"), ("n", "300"),
          ("n", "900"), ("n", "1200")],
         [("s", "U2"), ("s", "S2"), ("n", "800"), ("n", "46000"), ("n", "500"),
          ("n", "100"), ("n", "600")],
         # unit not in the Equipment Master -> should surface as unmatched
         [("s", "U9"), "", ("n", "10"), "", ("n", "5"), ("n", "5"), ("n", "10")],
         # serial-only row (telematics style) -> keyed SN:S3
         ["", ("s", "S3"), ("n", "120"), "", ("n", "20"), ("n", "100"), ("n", "120")],
         # no unit and no serial -> skipped
         ["", "", ("n", "1"), "", "", "", ""],
     ]),
    ("kpi_maint_mini.xlsx", "PM Due",
     ["Unit #", "PM Due Date", "Open Work Orders", "Down Days", "Last Service", "Condition"],
     [
         [("s", "U1"), ("s", "9/15/2026"), ("n", "2"), ("n", "0"), ("s", "2026-06-01"),
          ("s", "Serviceable")],
         [("s", "U3"), ("s", "7/01/2026"), ("n", "0"), ("n", "4"), ("s", "2026-01-15"),
          ("s", "Awaiting parts")],
     ]),
    ("kpi_cost_mini.xlsx", "Rental Cost",
     ["Unit Number", "Monthly Cost", "Cost To Date", "Fuel Gallons", "Ownership", "Vendor"],
     [
         [("s", "U1"), ("s", "$4,200.00"), ("s", "19,400"), ("n", "880"),
          ("s", "Rented"), ("s", "Holt CAT")],
         [("s", "U2"), ("s", "(150)"), ("s", ""), ("n", "40"), ("s", "Owned"), ""],
     ]),
]


def col_letter(i):
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def build_shared(all_rows):
    strings, index = [], {}
    for row in all_rows:
        for cell in row:
            if isinstance(cell, tuple) and cell[0] == "s" and cell[1] not in index:
                index[cell[1]] = len(strings)
                strings.append(cell[1])
    return strings, index


def xml_escape(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def write_xlsx(out, sheet_name, headers, rows):
    all_rows = [[("s", h) for h in headers]] + rows
    strings, sidx = build_shared(all_rows)
    shared_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                  'count="%d" uniqueCount="%d">' % (len(strings), len(strings))
                  + "".join('<si><t xml:space="preserve">%s</t></si>' % xml_escape(s) for s in strings)
                  + "</sst>")
    rows_xml = []
    for r, row in enumerate(all_rows, start=1):
        cells = []
        for c, cell in enumerate(row):
            if cell == "" or cell is None:
                continue
            ref = col_letter(c) + str(r)
            kind, val = cell
            if kind == "s":
                cells.append('<c r="%s" t="s"><v>%d</v></c>' % (ref, sidx[val]))
            else:
                cells.append('<c r="%s"><v>%s</v></c>' % (ref, val))
        rows_xml.append('<row r="%d">%s</row>' % (r, "".join(cells)))
    sheet_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                 '<sheetData>' + "".join(rows_xml) + '</sheetData></worksheet>')
    content_types = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        '</Types>')
    root_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>')
    workbook = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets></workbook>' % xml_escape(sheet_name))
    wb_rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        '</Relationships>')
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", root_rels)
        z.writestr("xl/workbook.xml", workbook)
        z.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        z.writestr("xl/sharedStrings.xml", shared_xml)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)


def main():
    here = os.path.join(os.path.dirname(__file__), "fixtures")
    os.makedirs(here, exist_ok=True)
    for name, sheet, headers, rows in FIXTURES:
        out = os.path.join(here, name)
        write_xlsx(out, sheet, headers, rows)
        print("wrote", out)


if __name__ == "__main__":
    main()
