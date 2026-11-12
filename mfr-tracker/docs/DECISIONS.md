# Decisions

## Task 1

- **Where the project lives.** The kit was found inside `files.zip` of a separate repository (NapsterX27/req-tracker), not at the root of this session's repository. It was placed at `mfr-tracker/` inside the session repository (`BE-apps-tools/1127`), because that is the only repository this session can push to. Nothing outside `mfr-tracker/` was changed. Rejected: working in the read-only req-tracker clone (cannot push).
- **Scaffold folder name.** `create-next-app` rejects names starting with an underscore, so the scaffold folder was `scaffold-tmp` instead of `_scaffold`. It was removed after the move.
- **`cacheComponents` and `partialPrefetching` removed.** The scaffolded `next.config.ts` enabled both. Every page in this app reads the session cookie, and the contract does not call for these options. Removed to keep ordinary dynamic rendering.
- **`.gitignore`.** The scaffold ignores `.env*`; `!.env.example` was added so the provided example file stays tracked.
- **`@types/node`.** Raised from `^20` to `^22` because the installed Vitest needs `^22 || >=24` and the runtime here is Node 22. Same package, no new dependency.
- **`AGENTS.md`** was produced by the scaffold and is kept as generated.
- **Branch and pushing.** CLAUDE.md says do not push; the owner's session instruction overrides it: push to branch `claude/permission-mode-accept-edits-2gn2aq` after every task, never the default branch. "Repo root" means `mfr-tracker/` inside the existing repository; no `git init` was run.
- **Typecheck script.** `npm run typecheck` is `next typegen && tsc --noEmit`, because the scaffolded layout uses the generated global `LayoutProps` type, which does not exist on a clean clone until route types are generated.

## Task 2

- **Table count.** The plan says `0001_init.sql` creates 11 tables; the file defines 12 (`app_users, parts, part_aliases, people, crews, crew_parts, scan_batches, scan_pages, requisitions, requisition_lines, audit_log, app_settings`) and 2 views. The migration test asserts 12 (the SQL is the authority; it must not be edited).

## Task 3

- **`inferRequestDate` anchor.** The contract describes parsing with the year of `today` and then subtracting a year when the result is more than 60 days ahead. That alone gives `2026-01-03` for `1-3` with today `2026-12-30`, but the required result is `2027-01-03`. The function also passes `today` as the anchor to `parseDate`, so its existing 180-day roll-forward handles the January case. All five required rows pass.
- **Lint scope.** `eslint .` flagged the generated PDF worker, `seed/`, and uses of `any` inside the provided `tests/domain/{parse,rules,orientation}.test.ts`, which CLAUDE.md forbids editing. `eslint.config.mjs` ignores generated and provided data paths and turns off `no-explicit-any` for those three files only. Rejected: editing the provided tests.
- **`parse_mismatch` is noisy for pack-only text.** Per contract 6.3 a difference "including exactly one being null" raises `parse_mismatch`. When the model returns `qty_each: null` for "3 Boxes" and the parser computes 1395 from the pack size, the flag is raised and confidence is capped at medium. Kept as written; a person verifies the line anyway. The unit test gives the model the 1395 it would need to avoid the flag.

## Task 4

- **`src/server/errors.ts`.** The plan names a typed `HttpError` in `http.ts`. Services must not know about HTTP, so they throw `AppError` (code such as `validation`, `conflict`) from a small new file `src/server/errors.ts`, and `http.ts` maps codes to statuses. No dependency added.
- **Last-admin rule** applies to whichever user would be the last active admin, not only to self-service changes. A stricter reading of "an admin cannot deactivate or demote themselves if they are the last active admin".
- **Forced password change on the API.** `requireApiUser` refuses requests from a user whose `must_change_password` is true, except the change-password route, matching the page redirect in `requirePageUser`.
- **Unknown or inactive email** still runs one bcrypt comparison so response time does not reveal which emails exist.
- **Login page** is a server component with `dynamic = 'force-dynamic'` so the build never touches a database.

## Task 6

- **No `ANTHROPIC_API_KEY` in this environment.** The Anthropic adapter is built and type-checked but was never called against the live API. `npm run ai:check` printed "skipped" and `docs/AI_CHECK.md` was not created. Everything else runs on the mock or with AI off. Per the fallback table, `npm run ai:check` is to be run by the owner once a key is set.
- **Schema syntax for structured output.** The documented limits allow `anyOf` and do not mention `$comment` or type arrays. `toStructuredSchema` in `src/server/ai/anthropic.ts` rewrites `"type": ["string","null"]` into `anyOf` and drops `$comment`. Field names, types and meanings are unchanged, and a unit test checks this. The JSON-in-text retry path is also built.
- **`ai:check` reads the whole-page image only.** The detail crop is made on a browser canvas (contract 10), which a script cannot do. The report says so.
- **`findDuplicates` and `DuplicateRef` exist from Task 6.** `getDraft` needs them, so `src/server/services/requisitions.ts` starts with just those; Task 7 adds the rest.
- **`getDraft` requires status `needs_review`.** Other statuses give a 409-class error.
- **Rotating a page.** `replacePageImage` adds the rotation to `rotation_applied` modulo 360, clears the old reading, and sets the page back to `uploaded`. It refuses pages that are posted, duplicate, rejected or being read.
- **Detail crop removal.** If a replacement carries no detail image, the stored detail is removed so a stale crop is never read with a new full image.
- **`nextPageToVerify`** returns the next page after the given one in batch and page order, or null at the end of the queue (no wrap-around).

## Task 7

- **`DuplicateRef` and `findDuplicates`** moved into the full `requisitions.ts` (they began as a stub in Task 6). No change in behaviour.
- **Audit detail for edits.** `requisition.update` stores `{ before, after }` as a compact snapshot (crew, requester, PB, date, flags and, per line, part, quantity text, each-count, initials, issued quantity), not every column.
- **Initialed lines at posting** leave `issued_on` empty. `issued_on` is set only by "Mark issued".
- **Posting from a scan page** is claimed with a conditional update on `status = 'needs_review'`, inside the same transaction as the insert, so two people cannot post one page twice.
- **Mark issued** on a void requisition skips its lines.

## Task 8

- **Seed stats vs contract cell count.** `seed/seed_stats.json` says 408 matrix cells (numeric PBs only, as the reference importer counts); contract section 9 says 409 including the text location "FOR LDYs". The matrix test asserts 409.
- **Export `Crew` column** shows the crew's printed name (for example `STAGE & PREP`), not its code. The tracker filter still uses the code. Issue status is exported as stored (`issued` or `pending`).
- **CSV** ends with a final CRLF, so 425 data and header lines are followed by an empty last element when split.
- **Matrix export** (`/api/matrix/export`) is a single sheet `Matrix` with a crew row above the part numbers, row totals and a totals row. The contract fixes only the file name.
- **Users API.** `POST /api/users` generates a temporary password when none is sent and returns it once as `temporaryPassword`. `PUT /api/users/[id]` accepts `password` (set this exact temporary password) or `resetPassword: true` (generate one, returned once). Both force a password change at next sign-in.
- **New crews** get a code derived from the name (`Night Shift` becomes `NIGHT_SHIFT`, with `_2`, `_3` on a clash) and an empty checks list; the per-crew consistency checks of the seeded crews are not editable in the UI (not in the plan).
- **`parts` list** hides inactive (merged) parts unless `includeInactive` is passed.
- **Next route files** may not export extra names, so the zod bodies in route files are not exported.

## Task 9

- **System fonts.** The scaffold loaded Geist through `next/font/google`, which downloads fonts at build time. Removed for contract section 2 (system fonts, no CDN assets). The scaffold's dark-mode colours were removed too; the design specifies one neutral gray theme.
- **`src/lib/format.ts`** holds `fmtDate` (MM/DD/YYYY), `fmtNum` (thousands separators) and `todayIso`. It is not in the contract layout; it has no I/O and no dependencies.
- **Inbox count** in the top bar is the number of pages waiting for review (the "To verify" tab).
- **Menus** (Admin, user) use native `<details>`, so they work without client JavaScript. Sign out is the only client code in the top bar.
- **Tabs** are links with the active tab in the URL (`?tab=`), for the same reason.

## Task 10

- **Test order for `pipeline.ts`.** The queue runner and its test file were written in one step, so the test was not seen failing first. The code is small and the six tests exercise every case in the plan; the services and domain code of Tasks 2 to 8 followed test-first.
- **Batches per upload.** Each PDF becomes one batch (page numbers are its pages). All image files in one selection become one batch. The API limit is 300 pages per batch, and the UI says so before anything is sent.
- **`src/components/scan/api.ts`** (browser calls to the scan routes) is not in the contract layout. It is shared by the upload zone and the Rotate button of Task 11.
- **`prepareScan` and `buildPageImages`** live in `canvas.ts` with the other canvas helpers so the verify screen can rebuild images with the same rules.
- **Thumbnails.** The contract defines no thumbnail variant, so each card shows the stored 1600 px image scaled by CSS and lazy-loaded. Cards per tab are capped at 50 with "Load more".
- **Retry.** A page whose upload succeeded but whose read failed retries only the read. A page whose upload failed is rendered and uploaded again.
- **Rotation is not re-checked after upload.** "Check rotation" shows in the progress list only, per contract section 7.

## Task 11

- **`setAsWritten` and `setPart` take the lookups as a fourth argument.** The plan lists `(state, lineIndex, text)`, but the parser needs each part's pack sizes and the part resolver needs the part and alias lists, so they cannot be pure without them. The form-state tests pass `lookups` explicitly.
- **Clearing "Each" hands control back to the parser.** The plan says the parser stops refilling Each once the user has typed in it. An empty Each counts as "not typed", so deleting the hand-typed value lets "As written" fill it again.
- **Requisitions loaded from the database** start with Each marked as hand-set, so opening one never silently recalculates stored quantities; editing "As written" there still works because typing in it only refills when Each was empty or auto-filled.
- **Changing the crew** replaces the part rows only after confirmation when quantities are typed. When no crew was chosen yet (the AI could not tell) the lines already on the form are kept and only the crew is set.
- **Type-only import from `server/`.** `form-state.ts` imports the `RequisitionDetail` type from the requisitions service with `import type`; it is erased at build time, so no server code reaches the browser.
- **Added service helpers:** `getQueuePosition` (for "Page 3 of 14 to verify") in `scans.ts` and `nextUnverified` in `requisitions.ts`, with tests.
- **Skip and next page** wrap to the first remaining page when the current page is the last in the queue, so a skipped page is not lost; the queue is empty only when no other page is waiting.
- **Rotate** rebuilds both images in the browser, uploads them, and reads the page again. Anything typed on the form before rotating is replaced by the new reading.
- **Cache busting.** Page images are cached for an hour by the API, so the image pane adds a version query after a rotation.
- **Void requisitions** open read-only (the whole form is disabled).

## Task 12

- **Crew filter is single-choice in the bar.** The service and the URL accept several `crew` values; the bar offers one. Links with repeated `crew` parameters still work and are shown as the first one in the select.
- **Part filter is single-choice in the bar** for the same reason; the matrix cell links use one part.
- **Row click** opens the requisition, but clicks on the link, a checkbox or a button do not.
- **Select all** on the tracker selects only the pending lines on the current page that have an each-count (the ones that can be marked issued).
- **Matrix repeat badge** shows the real count (`x2`, `x3`). 12 cells show `x2` and one shows a higher number; together they are the 13 repeat cells.
- **Void requisitions** are only shown on the tracker when "Include void" is ticked, and then with strike-through text.
