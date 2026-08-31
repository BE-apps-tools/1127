"""Generate tiny .xlsx fixtures for the KPI report families.

Each fixture mirrors the **real JDE export's** shape, including the parts that
break naive parsers: a report title above the header row (Equipment Rates puts
four rows there), an embedded newline inside a header, blank spacer columns, a
'Description' header repeated for an unrelated column, money as '$4,200.00',
credits as '(150)', and — for the transfer log — several rows per unit plus the
initial-load snapshot block that must not be read as real state changes.

The unit numbers match build/tests/fixtures/mini.xlsx (the Equipment Master
fixture), so the join can be tested too. No real vendor, PO or rate data is used.

Usage: py build/tests/make_kpi_fixture.py
"""
import os
import zipfile

# (filename, sheet, [pre-header rows], headers, data rows).
# Cells: ("s", text) | ("n", number) | "".
FIXTURES = [
    # --- Equipment Rates: title rows above the header, blank spacer column ---
    ("kpi_rates_mini.xlsx", "Equipment Rates",
     [[], [("s", "SITE1 - Alpha Solar, TX")], [], []],
     ["Project\nNumber", "Unit\nNumber", "Description", "Begin Date", "End Date",
      "Rate\nGroup", "Rate Group Description", "Billing Type", "Monthly Ownership",
      "Hourly\nBilling\nRate", "Monthly\nBilling\nRate", "Ownership Component",
      "Preventative Maintenance", "", "Corrective Repair", "Tires / U.C.",
      "Oil / Grease", "GET", "Monthly\nNon-Hourly\nOwnership"],
     [
         [("s", "SITE1"), ("s", "U1"), ("s", "Excavator, tracked"), ("n", "46023"), ("n", "46507"),
          ("s", "364"), ("s", "Whl Ldr LT 2 cu yards"), ("s", "Hourly"), ("s", "7,392.00"),
          ("n", "51.61"), ("s", "7,392.00"), ("n", "42.00"), ("n", "0.66"), "",
          ("n", "2.59"), ("n", "1.50"), ("n", "3.86"), ("n", "1.00"), ("n", "0")],
         [("s", "SITE1"), ("s", "U2"), ("s", "Generator 20kW"), ("n", "46023"), ("n", "46507"),
          ("s", "512"), ("s", "Jobcost Eq w/ mo rent"), ("s", "Non Hourly"), ("n", "0"),
          ("n", "0"), ("s", "1,250.00"), "", "", "", "", "", "", "", ("s", "1,250.00")],
         # a unit that isn't in the Equipment Master -> surfaces as "elsewhere"
         [("s", "SITE1"), ("s", "U9"), ("s", "Radio, portable"), "", "",
          ("s", "900"), ("s", "Portable Radio - Small"), ("s", "Non Hourly"), ("n", "0"),
          ("n", "0"), ("n", "45"), "", "", "", "", "", "", "", ("n", "45")],
     ]),
    # --- Anniversary Date: one title row, duplicate 'Description', $ and () money ---
    ("kpi_rental_mini.xlsx", "Anniversary Date",
     [[("s", ""), ("s", ""), ("s", "Anniversary Date")]],
     ["Unit Number", "Description", "", "Serial Number", "EQ\nSt", "Location ", "Trade",
      "Description", "PO#", "Vendor", "Acquired\nDate", "Billed\nThrough\nDate",
      "Contract\nDays", "Billing Type", "Total\nHourly\nRate", "",
      "Monthly\nNon-Hourly\nRate", "Bare Rental Rate", "Total Non-Hourly Rate"],
     [
         [("s", "U1"), ("s", "Excavator, tracked"), "", ("s", "S1"), ("s", "WK"),
          ("s", "SITE1"), ("s", "CIVIL"), ("s", "ID C140418"), ("s", "52120606"),
          ("s", "Acme Equipment Co"), ("n", "45873"), ("n", "46600"), ("n", "30"),
          ("s", "Hourly"), ("s", "36.35"), "", ("n", "0"), ("n", "0"), ("n", "0")],
         [("s", "U2"), ("s", "Generator 20kW"), "", ("s", "S2"), ("s", "WK"),
          ("s", "SITE1"), "", ("s", "ID EQ0025534"), ("s", "52115182"),
          ("s", "Northern Rentals LLC"), ("n", "45735"), ("n", "46000"), ("n", "28"),
          ("s", "Non Hourly"), ("n", "0"), "", ("s", "$125.00"), ("s", "1,190.0000"),
          ("s", "1,315.0000")],
         # a 2169 "billed through" is a JDE sentinel, not a date -> must be dropped
         [("s", "U3"), ("s", "Total station"), "", ("s", "S3"), ("s", "DN"),
          ("s", "SITE1"), "", "", ("s", "52130000"), ("s", "Acme Equipment Co"),
          ("n", "45900"), ("n", "98000"), ("n", "30"), ("s", "Non Hourly"), ("n", "0"), "",
          ("s", "(150)"), ("n", "0"), ("s", "(150)")],
     ]),
    # --- Equipment Transfer: an event log, header on row 0 ---
    ("kpi_transfers_mini.xlsx", "Equipment Transfer",
     [],
     ["Transfer Status", "Equipment \nNumber", "Equipment Description", "Serial Number",
      "Assigned Employee", "Effective\nDate", "Project\nTransferred From",
      "Project\nTransferred To", "Previous Status", "Current Status", "Request Remark",
      "Current Meter\nReading", "Current Trade", "Major Equipment Class"],
     [
         # U1: arrives, breaks twice, back to work — 2 closed down spans
         [("s", "Newly Acquired"), ("s", "U1"), ("s", "Excavator, tracked"), ("s", "S1"), "",
          ("n", "45900"), "", ("s", "SITE1"), "", ("s", "WK"), ("s", "arrived on site"),
          ("n", "0"), ("s", "CIVIL"), ("s", "Excavator")],
         [("s", "Processed"), ("s", "U1"), ("s", "Excavator, tracked"), ("s", "S1"), "",
          ("n", "45910"), ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "DN"),
          ("s", "hydraulic leak"), ("n", "0"), ("s", "CIVIL"), ("s", "Excavator")],
         [("s", "Processed"), ("s", "U1"), ("s", "Excavator, tracked"), ("s", "S1"), "",
          ("n", "45920"), ("s", "SITE1"), ("s", "SITE1"), ("s", "DN"), ("s", "WK"),
          ("s", "repaired 10 days later"), ("n", "0"), ("s", "CIVIL"), ("s", "Excavator")],
         [("s", "Processed"), ("s", "U1"), ("s", "Excavator, tracked"), ("s", "S1"), "",
          ("n", "45930"), ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "DS"),
          ("s", "to the shop"), ("n", "0"), ("s", "CIVIL"), ("s", "Excavator")],
         [("s", "Processed"), ("s", "U1"), ("s", "Excavator, tracked"), ("s", "S1"), "",
          ("n", "45934"), ("s", "SITE1"), ("s", "SITE1"), ("s", "DS"), ("s", "WK"),
          ("s", "back from the shop"), ("n", "0"), ("s", "CIVIL"), ("s", "Excavator")],
         # U2: the initial-load snapshot block — several same-date rows with no
         # previous status, each repeating a later remark. Must collapse to one
         # arrival marker rather than inventing five state changes.
         [("s", "Newly Acquired"), ("s", "U2"), ("s", "Generator 20kW"), ("s", "S2"), "",
          ("n", "45800"), "", ("s", "SITE1"), "", ("s", "WK"), ("s", "per timecards"),
          ("n", "0"), "", ("s", "Generator")],
         [("s", "Newly Acquired"), ("s", "U2"), ("s", "Generator 20kW"), ("s", "S2"), "",
          ("n", "45800"), "", ("s", "SITE1"), "", ("s", "DN"), ("s", "fuel issues"),
          ("n", "0"), "", ("s", "Generator")],
         [("s", "Newly Acquired"), ("s", "U2"), ("s", "Generator 20kW"), ("s", "S2"), "",
          ("n", "45800"), "", ("s", "SITE1"), "", ("s", "DS"), ("s", "went to vendor"),
          ("n", "0"), "", ("s", "Generator")],
         # U3: down and still down (open span), transferred in from another site
         [("s", "Processed"), ("s", "U3"), ("s", "Total station"), ("s", "S3"), "",
          ("n", "45950"), ("s", "SITE2"), ("s", "SITE1"), ("s", "AV"), ("s", "WK"),
          ("s", "moved from Beta Wind"), ("n", "0"), ("s", "COMMISSG"), ("s", "Survey")],
         [("s", "Processed"), ("s", "U3"), ("s", "Total station"), ("s", "S3"), "",
          ("n", "45960"), ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "DN"),
          ("s", "dropped, needs calibration"), ("n", "0"), ("s", "COMMISSG"), ("s", "Survey")],
         # two changes on one date: the last is the state at the end of that day
         [("s", "Processed"), ("s", "U4"), ("s", "Trailer Utility"), ("s", "S4"), "",
          ("n", "45970"), ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "DN"),
          ("s", "flat tire"), ("n", "0"), "", ("s", "Trailers - Haul")],
         [("s", "Processed"), ("s", "U4"), ("s", "Trailer Utility"), ("s", "S4"), "",
          ("n", "45970"), ("s", "SITE1"), ("s", "SITE1"), ("s", "DN"), ("s", "WK"),
          ("s", "tire changed same day"), ("n", "0"), "", ("s", "Trailers - Haul")],
         # Missing/stolen: unavailable but not a maintenance question
         [("s", "Processed"), ("s", "U5"), ("s", "Laptop"), ("s", "S5"), "",
          ("n", "45975"), ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "MS"),
          ("s", "not returned"), ("n", "0"), "", ("s", "Office Equipment")],
         # an undated row is not an event
         [("s", "Processed"), ("s", "U6"), ("s", "Light Tower"), ("s", "S6"), "",
          "", ("s", "SITE1"), ("s", "SITE1"), ("s", "WK"), ("s", "DN"), ("s", "no date"),
          ("n", "0"), "", ("s", "Major Tools")],
     ]),
    # --- Damage Expenses: a cost ledger, many lines per unit, title row above ---
    ("kpi_damage_mini.xlsx", "Damage Expenses",
     [[("s", ""), ("s", ""), ("s", ""), ("s", "Damage Expenses")]],
     ["Document\nType", "Document Number", "Invoice Number", "", "PO #", "G/L Date",
      "Project\nNumber", "Object\nAccount", "Subsidiary", "Unit Number", "Unit Description",
      "Subledger", "Subledger Description", "Journal Entry Explanation", "Remark",
      "Transaction Originator", "Damage Area Code", "Incident Case\nNumber",
      "Actual Cost\nAmount"],
     [
         # U1: two lines on one document (one incident), then a second incident
         [("s", "PV"), ("s", "275649"), ("s", "INV-1"), "", ("s", "52112198"), ("n", "45900"),
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U1"), ("s", "Excavator, tracked"),
          ("s", "E"), ("s", "00253600"), ("s", "Acme Fleet Service LLC"), ("s", "bent boom pin"),
          ("s", "JDOE"), "", "", ("s", "1,250.00")],
         [("s", "PV"), ("s", "275649"), ("s", "INV-1"), "", ("s", "52112198"), ("n", "45900"),
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U1"), ("s", "Excavator, tracked"),
          ("s", "E"), ("s", "00253600"), ("s", "Acme Fleet Service LLC"), ("s", "Labor"),
          ("s", "JDOE"), "", "", ("s", "$400.00")],
         [("s", "JE"), ("s", "295529"), ("s", "INV-2"), "", "", ("n", "45960"),
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U1"), ("s", "Excavator, tracked"),
          ("s", "E"), ("s", "00351109"), ("s", "PNC"), ("s", "windshield"),
          ("s", "JDOE"), "", "", ("n", "612.5")],
         # a credit note must stay negative, not be dropped
         [("s", "PV"), ("s", "295530"), ("s", "INV-3"), "", "", ("n", "45965"),
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U2"), ("s", "Generator 20kW"),
          ("s", "E"), ("s", "00351110"), ("s", "Acme Fleet Service LLC"), ("s", "returned part"),
          ("s", "JDOE"), "", "", ("s", "(314.10)")],
         # an undated line is not a charge
         [("s", "PV"), ("s", "295531"), ("s", "INV-4"), "", "", "",
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U3"), ("s", "Total station"),
          ("s", "E"), ("s", "00351111"), ("s", "PNC"), ("s", "no date"),
          ("s", "JDOE"), "", "", ("n", "99")],
         # a line with no amount is not a charge either
         [("s", "PV"), ("s", "295532"), ("s", "INV-5"), "", "", ("n", "45970"),
          ("s", "SITE1"), ("s", "591100"), ("s", "015271"), ("s", "U4"), ("s", "Trailer Utility"),
          ("s", "E"), ("s", "00351112"), ("s", "PNC"), ("s", "no amount"),
          ("s", "JDOE"), "", "", ""],
     ]),
    # --- Utilization: the weekly hours export ---
    ("kpi_util_mini.xlsx", "Utilization",
     [],
     ["Unit\nNumber", "Serial Number", "Hour Meter", "Meter Date", "Idle Hours",
      "Working Hours", "Period Hours"],
     [
         [("s", "U1"), ("s", "S1"), ("n", "5200"), ("n", "46000"), ("n", "300"),
          ("n", "900"), ("n", "1200")],
         [("s", "U2"), ("s", "S2"), ("n", "800"), ("n", "46000"), ("n", "500"),
          ("n", "100"), ("n", "600")],
         # serial-only row (telematics style) -> keyed SN:S3
         ["", ("s", "S3"), ("n", "120"), "", ("n", "20"), ("n", "100"), ("n", "120")],
         # no unit and no serial -> skipped
         ["", "", ("n", "1"), "", "", "", ""],
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


def write_xlsx(out, sheet_name, pre_rows, headers, rows):
    all_rows = list(pre_rows) + [[("s", h) for h in headers]] + list(rows)
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
    for name, sheet, pre, headers, rows in FIXTURES:
        out = os.path.join(here, name)
        write_xlsx(out, sheet, pre, headers, rows)
        print("wrote", out)


if __name__ == "__main__":
    main()
