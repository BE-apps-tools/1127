# Handoff

MFR Tracker is built to the plan: all 16 tasks, in order. This note says what exists, how it was checked, what was
skipped or changed, and what you still need to decide.

## What was built

- **Sign-in** with two roles (admin, member): password hashes, forced change of temporary passwords, lockout after 8 failed attempts for 15 minutes, signed cookie for 12 hours.
- **Inbox**: drop PDF, JPG or PNG scans; pages are rendered, rotated upright and cropped in the browser, stored, and read by the AI adapter (Anthropic, mock or off). Tabs for To verify, Processing, Failed, Duplicates, Rejected and Posted.
- **Verify screen**: scan on the left (zoom, pan, whole or detail, rotate 90 degrees), form on the right, amber for reads the model was unsure about, duplicate banner, per-crew quantity warnings, Ctrl+Enter to post, Alt+N to add a line.
- **Requisition screen** and **manual entry**: same form, history from the audit log, Mark verified, Void (admin), Next unverified.
- **Tracker**: filters in the URL, totals for the filter, CSV and Excel export, Mark issued for pending lines.
- **Matrix**: power block by part, repeat issues highlighted, Issued or Requested, Verified only, Excel export.
- **Admin**: parts (edit, aliases, needs-review filter, merge), crews, people, users.
- **Backlog**: 148 pages loaded as 140 posted, unverified requisitions (424 lines, 8 duplicate scans linked to their originals).
- **Scripts**: `seed`, `db:migrate`, `user:create`, `preflight`, `ai:check`, `go-live`.

## How it was checked

See `docs/BUILD_LOG.md` for the line per task and the final verification entry for exact counts.

- Unit and integration tests (Vitest) on an embedded database, including every number in the contract's "After seeding" table.
- The database layer was also run against a real PostgreSQL 16 server on the build machine: the shared conformance test passed there, and `db:migrate`, `seed`, `preflight` and the running app (sign-in, dashboard, tracker, Excel export) worked through the `pg` driver. This is not Supabase itself.
- One browser smoke test (Playwright, Chromium): sign in, dashboard numbers, tracker filter, matrix cell, upload and verify a scan, mark it a duplicate, post a new requisition, search it, download the CSV.

## What was skipped, changed or could not be checked

Everything below is also in `docs/DECISIONS.md` with the reasoning.

- **The live AI was never called.** There was no `ANTHROPIC_API_KEY` in the build environment, so the Anthropic adapter is built and type-checked but untested against the real model, and `npm run ai:check` was skipped (no `docs/AI_CHECK.md`). Run it once you have a key.
- **Supabase Storage and the Supabase connection were not exercised.** No Supabase account was available. The storage driver and `go-live` were written to the documented API and checked up to the point where credentials are needed; `npm run go-live` stops with a list of missing variables, which was tested.
- **Where the project lives.** The kit arrived inside a zip in a separate repository, so it was placed in `mfr-tracker/` inside this session's repository and committed and pushed there to the session branch after every task, as instructed. Nothing outside `mfr-tracker/` was changed.
- **Plan wording that did not match the files:** the schema has 12 tables (the plan says 11); the matrix has 409 cells including the text location (the seed stats file counts 408 numeric ones); `setAsWritten` and `setPart` take the lookups as an extra argument; `inferRequestDate` also anchors on today so a late-December date for early January rolls forward.
- **Not built, by design (DESIGN section 4):** on-hand inventory, ERP integration, foreman or mobile entry, multiple sites, email, approvals, signature recognition, partial issues, offline use.

## Where the admin login is (local mode)

`npm run seed` prints the first admin login once and saves it to `.data/admin-password.txt` (git-ignored). The first
sign-in asks for a new password. Create the rest of the team in Admin, Users.

## Open items for you (from DESIGN section 11)

| Item | Action |
|---|---|
| Company data on Supabase and Vercel, scans sent to the Anthropic API | Get the project manager or IT to agree before the team uses the cloud deployment. Local mode keeps everything on one machine. |
| 61018-063 (Panels form) vs 60819-063 (hardware master) for the small panel bolt | Confirm the right number, then use Merge into in Admin, Parts. |
| 25233-00 (Torque & Align form) vs 25233-001 (hardware master) | Same. |
| Box size 465 for 60825-300 is inferred from two write-in lines | Confirm in Admin, Parts. |
| One write-in part number on page A-065 (MFR-000061, line 8) could not be read | Resolve on that requisition. |
| AI accuracy on handwriting is unproven until tested on live pages | The verify step is mandatory. Run `npm run ai:check` once a key is set. |
| The approver is not captured from the signature | Pick it on the verify screen if it matters. |
| 140 backlog requisitions are unverified | Work through them with Next unverified on the requisition screen and mark each verified. |

## Definition of done (contract section 13)

Ticked at the end of Task 16.

- [ ] `npm run verify` passes from a clean clone after `npm install`.
- [ ] All section 9 checks are covered by tests and pass.
- [ ] `npm run e2e` passes, or DECISIONS.md records why it could not run.
- [ ] In local mode with no environment file: `npm install && npm run seed && npm run dev` gives a working app with 140 requisitions.
- [ ] `docs/HANDOFF.md`, `docs/GO_LIVE.md`, `docs/BUILD_LOG.md` and `README.md` are written.
- [ ] No file under section 1 has changed. No secret is in the repo. `.env.local` and `.data/` are git-ignored.
