# MFR Tracker - Design

Version 1.0, 2026-11-12. Owner: Ruben (Senior Site Inventory Specialist). Architect: Claude.
This document says what is being built and why. `docs/BUILD_CONTRACT.md` says how. `docs/BUILD_PLAN.md` is the ordered task list.

## 1. Purpose

Field crews request hardware from the site inventory yard on a paper form, the Material Field Requisition (MFR).
Today those forms are the only record of what was asked for and what left the yard. They cannot be searched,
totalled, or reconciled.

MFR Tracker turns scanned forms into a searchable issue log:

1. The inventory team uploads a scan (PDF or photos).
2. The app straightens each page and an AI model reads it.
3. A team member checks the reading against the scan on one screen and posts it.
4. Posted requisitions feed a tracker and a power block by part matrix that can be filtered and exported to Excel.

Users: Ruben and his inventory team (two to five people), each with a login. Nobody else.

## 2. What the paper forms look like

Source: two scanned PDFs, 148 pages, request dates 2026-07-28 to 2026-11-10, power blocks 1 to 106.

Every page is one form with the same grid:

| Field on paper | Meaning |
|---|---|
| Foreman/Responsible Crew | Printed crew name plus a foreman name (photocopied, stamped or handwritten) |
| PB Locations | Power block the material is for |
| Date | Request date |
| Part # / Description | Pre-printed per crew for the first rows; blank rows below take handwritten extras |
| Qty Needed | Handwritten |
| Date Required by | Handwritten, often once at the top of the column |
| SIS/IA | Initials of the inventory person who handled the line |
| Approved By | Signature |

Seven pre-printed versions exist, one per crew:

| Crew code | Printed on form | Foreman names seen | Pre-printed parts |
|---|---|---|---|
| STAGE_PREP | STAGE & PREP | Jacob Johnson, later Erick Hernandez | 25050-001, 25056-001, 20-0070-07 |
| MIBS | MIBS ANTHONY RODREIGUEZ | Anthony Rodriguez | 60825-300, 60852-000, 60963-300, 60964-000 |
| TORQUE_ALIGN | TORQUE & ALIGN | Clayton Noble, later Justin Herring | 60811-090, 60811-100, 60811-105, 25233-00, 30836-000, 60780-000 |
| TUBES | Misc TUBES | Aldair Leyva | 25244-000 (80 per box, 3840 per pallet) |
| PANELS | (handwritten "Panels") | Carlos Renteria | 60818-063, 60696-000, 61018-063, 60816-000 |
| MOTORS | RON STEWART | Erick Hernandez | 25254-43-001, 25164-000 |
| MISC | Misc | Jacob Johnson | 15-part hardware master with engineering descriptions |

### Problems in the paper process that drive the design

| Problem found in the 148 pages | Design response |
|---|---|
| No requisition number. 8 pages are second scans of a form already in the pile. | Every posted requisition gets a number (MFR-000001). A fingerprint of crew + PB + date + part and quantity pairs warns before a second copy is posted. |
| Quantities are free text: "596 bolts", "1 Pallet/3840", "2 Boxes/930", "100's". | Store the text as written and a parsed each-count side by side. A tested parser does the conversion. Pack sizes live on the part. |
| Dates often have no year ("9-8"). | Tested date parser infers the year from the request date. |
| Foreman changes mid-project; one name is scribbled out. | Requester is a pick list of people, separate from the crew. |
| Part numbers disagree between forms (61018-063 vs 60819-063; 25233-00 vs 25233-001). Write-in lines carry short or mislabeled numbers. | Parts carry a "needs review" mark and aliases. An admin can merge one part into another without losing history. |
| 19 forms have no SIS/IA initials. | Lines are Issued or Pending. Pending lines can be marked issued later. |
| Three Torque & Align forms have quantities that do not add up. | Per-crew consistency checks raise a warning on the verify screen. |
| Handwriting is hard to read in places (4 vs 6 on the MIBS forms). | Every reading carries a confidence mark. Anything below high is highlighted with the alternative reading. |
| Pages are scanned upside down and out of order. | Automatic rotation from the blue header band (validated on all 148 pages in all four orientations). |

## 3. Decisions

Decided by Ruben on 2026-11-12:

| # | Decision |
|---|---|
| D1 | New requisitions enter by scan upload. AI reads, a person verifies. |
| D2 | Users are Ruben and his inventory team. Shared web app with logins. |
| D3 | SIS/IA initials on a line mean exactly the Qty Needed left the yard. No initials means nothing has been issued yet. |

Decided by the architect, with reasons:

| # | Decision | Why |
|---|---|---|
| A1 | Standalone app, not a GRID module. Plain PostgreSQL schema. | Ships fast and stays simple. Same database dialect as GRID, so the tables can be ported later. |
| A2 | Next.js on Vercel, Postgres and file storage on Supabase. | Ruben already runs this stack. |
| A3 | A local mode with an embedded Postgres, disk storage and optional AI. | The whole app can be built, tested and demonstrated with no cloud accounts. The builder never has to stop for credentials. |
| A4 | The app owns its logins (email, password hash, signed cookie). No Supabase Auth, no RLS policies. All database access happens on the server. | One auth path that behaves the same in local and cloud mode and can be tested without a network. Nothing in the browser can reach the database. |
| A5 | PDF pages are rendered, rotated and cropped in the browser. | Avoids native image libraries on the server and Vercel's request size limit. |
| A6 | The AI returns what is written plus its confidence. Deterministic code does all parsing and arithmetic. | Parsing must be testable and repeatable. The model's own number is used only to cross-check. |
| A7 | The issue rule (D3) is a database constraint. | A line can never show an issued quantity that disagrees with its initials. |
| A8 | The backlog loads as posted but unverified. | The tracker is useful on day one; verification proceeds page by page. |
| A9 | Issue log only. | See non-goals. |

## 4. Scope

In scope for v1:

- Logins with two roles: admin and member.
- Scan upload (PDF, JPG, PNG), automatic rotation, AI reading, verify and post.
- Manual entry of a requisition without a scan.
- Tracker: one row per requisition line, filters, sort, totals, CSV and Excel export.
- Matrix: power block by part, cumulative quantity, repeat issues highlighted, Excel export.
- Mark pending lines as issued.
- Master data: parts (pack sizes, aliases, merge), crews and their part lists, people, users.
- Duplicate detection, per-crew consistency warnings, audit log.
- Backlog of 148 scanned pages preloaded.

Non-goals. Do not build these:

- On-hand inventory, receiving, adjustments, cycle counts.
- Any JDE or ERP integration beyond file export.
- Foreman-facing or mobile-first request entry.
- Multiple projects or sites in one deployment.
- Email, notifications, approvals workflow.
- Signature recognition (the approver is a pick list).
- Partial issues or backorders (D3 rules them out for now; the columns allow adding them later).
- Offline use.

## 5. Workflow

```
Upload scan ──> split pages (browser) ──> auto-rotate ──> store page image
                                                              │
                                              AI reads page ──┘
                                                              │
                                                              ▼
                                   Verify screen: scan on the left, form on the right
                                     amber = AI unsure, banner = possible duplicate
                                                              │
                         ┌──────────────┬─────────────────────┼───────────────┐
                         ▼              ▼                     ▼               ▼
                       Post         Mark duplicate         Reject          Rotate and re-read
                         │
                         ▼
     Requisition MFR-000141 ──> Tracker (lines) ──> Matrix (PB x part) ──> Excel / CSV
```

Page status: `uploaded` > `extracting` > `needs_review` > `posted`, or `duplicate`, `rejected`, `failed` (retry).
With AI switched off, pages go straight to `needs_review` with an empty form to key by hand.

Line status: `issued` when SIS/IA initialed, else `pending`.

Requisition: `posted` or `void`. Separately, `verified` (a person has checked it against the scan) or not.
Requisitions posted from the verify screen or keyed by hand are verified at posting. Backlog requisitions start unverified.

## 6. Data model

| Table | Holds |
|---|---|
| app_users | Logins, role, password hash |
| parts | Part number, official description, field name, pack sizes, needs-review mark |
| part_aliases | Short or alternate numbers that map to a part |
| people | Foremen and approvers for pick lists |
| crews, crew_parts | Crew form versions and their pre-printed part lists; consistency checks |
| scan_batches, scan_pages | Uploaded files, one row per page, image key, status, raw AI reading |
| requisitions | One per form: number, crew, requester, PB, date, flags, fingerprint, verified |
| requisition_lines | One per filled row: part, quantity as written, each-count, pack, need-by date, initialed, issued |
| audit_log | Who changed what |
| app_settings | Small key/value settings |

Views: `v_tracker_lines` (tracker and exports), `v_pb_part_matrix` (matrix).
Full DDL: `db/migrations/0001_init.sql`. It has been run on PostgreSQL with the backlog loaded.

## 7. Business rules

R1 Issue rule. `qty_issued` equals `qty_requested` when the line is initialed, else 0. Enforced by the `issue_rule` constraint.

R2 Quantity parsing. `parseQty` in `src/domain/parse.ts`. "N Pallets/M" and "N Boxes/M" mean M items in N packs. A bare pack count uses the part's pack size, or leaves the each-count empty with the flag `pack_only`. "100's" is flagged `ambiguous_qty`. Blank or a dash means no line.

R3 Dates. `parseDate`. Month first. Missing year comes from the request date. A need-by date more than 180 days before the request date rolls to the next year.

R4 Need-by fill-down. If a form writes one need-by date, lines without their own date inherit the first date written in that column.

R5 PB location. `parsePb`. "PB 55" and "55" both become location "55", number 55. Text such as "FOR LDYs" is kept as written with no number.

R6 Part matching. `resolvePart`. Exact part number, then alias, then a unique prefix of five or more characters. No match leaves the line unresolved; it can still be posted and shows on the dashboard.

R7 Duplicates. `fingerprint`. Same crew, PB, request date and set of part:quantity pairs. A match raises a warning with a link to the existing requisition. The user either marks the page as a duplicate or confirms and posts anyway.

R8 Consistency checks. `runCrewChecks`. MIBS and Panels: bolt equals nut for each pair. Torque & Align: the three bolt lengths add to the kit, the bracket is twice the kit, end caps equal the kit. Motors: motors equal mounts. Warnings only.

R9 Confidence. high, medium or low on the form header and on each line, with a note giving the alternative reading. Anything below high is highlighted until the requisition is verified.

R10 Numbering. `MFR-` plus six digits from a database sequence. Never reused.

R11 Voiding. Requisitions are never deleted. An admin voids with a reason; void requisitions leave the tracker totals and the matrix.

R12 Editing. Any member can edit a posted requisition. Every save writes the before and after to the audit log.

## 8. Screens

Desktop first (1280 px and up), dense, keyboard friendly. Neutral gray with one blue accent.
Amber means "look here", green means issued or verified, red means failed or void.

```
Top bar:  MFR Tracker | Dashboard | Inbox (12) | Tracker | Matrix | Admin ▾ |            Ruben ▾
```

### 8.1 Dashboard `/`

Tiles, each a link to the filtered list behind it: Pages to verify, Failed reads, Backlog to verify,
Flagged reads, Lines pending issue, Parts to confirm, Lines with no part match, Repeat issues.
Below: the ten most recent requisitions.

### 8.2 Inbox `/inbox`

Drop zone for PDF, JPG and PNG. A progress list shows each page moving through render, upload and read.
Tabs: To verify, Processing, Failed, Duplicates, Rejected, Posted. Each page is a thumbnail card with its
status and the action that fits (Verify, Retry, Read anyway, Reopen).

### 8.3 Verify `/verify/[pageId]`

```
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│  [-] [+] [fit] [rotate 90°] [whole | detail] │ Page 3 of 14 to verify        [Skip] [Reject]│
│                                              │ ⚠ Possible duplicate of MFR-000037  [open]   │
│                                              │──────────────────────────────────────────────│
│             scanned page                     │ Crew [STAGE & PREP ▾]  Requester [Erick H. ▾]│
│             (zoom and pan)                   │ PB [103      ]  Request date [2026-11-02]    │
│                                              │ Approver [ ▾]  ☑ Signed   Notes [          ] │
│                                              │──────────────────────────────────────────────│
│                                              │ Part           As written   Each   Need by ☑ │
│                                              │ 25056-001 ▾    596 bolts    596    11-03   ☑ │
│                                              │ 20-0070-07 ▾   149 brackets 149    11-03   ☑ │
│                                              │ [+ line]                       [☑ all]       │
│                                              │ ⚠ 60780-000 (228) and 25233-00 (226) are     │
│                                              │   normally equal.                            │
│                                              │                [Mark duplicate] [Post ⌃↵]    │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

Fields the AI was unsure about have an amber outline and show its note underneath.
Typing in "As written" re-parses and refills "Each" unless the user has typed in "Each" themselves.
Ctrl+Enter posts and opens the next page. Alt+N adds a line.

### 8.4 Requisition `/requisitions/[id]` and `/requisitions/new`

The same form. With a scan, the image pane shows beside it. Extra actions: Mark verified, Void (admin), history.
New: choosing a crew loads its part list as rows; rows left without a quantity are dropped on save.

### 8.5 Tracker `/tracker`

One row per line. Filters in a bar above the table and mirrored in the URL: date range, crew, requester, PB
(number, range such as 81-90, or text), part, issue status, verified, flagged, source, search.
Footer shows line count and the totals of requested and issued for the filter. Export CSV and Excel.
Select pending lines and Mark issued. Row click opens the requisition.

### 8.6 Matrix `/matrix`

Rows are PB locations (numbers ascending, then text). Columns are parts, grouped in crew order.
Cells show the cumulative quantity. A cell fed by more than one requisition is amber with a small "x2".
Toggles: Issued or Requested; Verified only. Row and column totals. Cell click opens the tracker filtered to
that PB and part. Export Excel.

### 8.7 Admin `/admin/parts`, `/admin/crews`, `/admin/people`, `/admin/users`

Admin role only. Parts: edit, pack sizes, aliases, needs-review filter, Merge into. Crews: name, default
requester, ordered part list. People: requester and approver marks. Users: create with a temporary password,
change role, deactivate, reset password.

## 9. Roles and security

| Capability | member | admin |
|---|---|---|
| Upload, verify, post, edit, mark issued, export | yes | yes |
| Void a requisition | no | yes |
| Master data and users | no | yes |

- Passwords: bcrypt hash, ten characters minimum, temporary passwords must be changed at first login,
  lockout for 15 minutes after 8 failed attempts.
- Session: signed httpOnly cookie, 12 hours.
- No self sign-up. No public pages except the login page. Search engines are told not to index.
- Secrets live only in server environment variables.

## 10. Backlog

`seed/seed.json` holds a hand transcription of all 148 pages: 140 requisitions, 424 lines, 8 duplicate
scans linked to their originals. 38 requisitions carry a reading marked medium or low. `npm run seed`
loads them as posted and unverified with each page image attached, so the team can work through them on
the requisition screen and mark each verified. Expected totals after loading are in `seed/seed_stats.json`.

## 11. Risks and open items for Ruben

| Item | Action |
|---|---|
| Company data hosted on Supabase and Vercel, scans sent to the Anthropic API for reading | Get the PM or IT to agree before the team uses the cloud deployment. Local mode keeps everything on one machine. |
| 61018-063 (Panels form) vs 60819-063 (hardware master) for the small panel bolt | Confirm the right number, then Merge in Admin > Parts. |
| 25233-00 (Torque & Align form) vs 25233-001 (hardware master) | Same. |
| Box size 465 for 60825-300 is inferred from two write-in lines | Confirm in Admin > Parts. |
| One write-in part number on page A-065 could not be read | Resolve on that requisition. |
| AI accuracy on handwriting is unproven until tested on live pages | The verify step is mandatory. `npm run ai:check` compares AI readings with the transcription for six pages. |
| Approver is not captured from the signature | Pick it on the verify screen if it matters. |

## 12. Later, not now

Foreman request entry on a phone. Planned quantity per PB with over-issue alerts. Partial issues and
backorders. JDE issue file in the required import layout. Folding the tables into GRID.
