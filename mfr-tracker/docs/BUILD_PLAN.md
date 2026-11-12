# MFR Tracker Implementation Plan

> **For agentic workers:** If the superpowers skills are installed, use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. If they are not, execute the
> tasks in order in this session. Steps use checkbox (`- [ ]`) syntax for tracking. Never pause to ask the user
> anything; `CLAUDE.md` says what to do instead.

**Goal:** A shared web app where an inventory team uploads scanned Material Field Requisitions, an AI reads them, a person verifies, and posted lines feed a tracker and a power block by part matrix.

**Architecture:** Next.js App Router with a pure `domain` layer, a `services` layer over swappable adapters (Postgres or embedded PGlite, Supabase Storage or disk, Anthropic or mock AI), and thin route handlers. The app owns its logins. PDF pages are rendered and rotated in the browser.

**Tech Stack:** Next.js, TypeScript strict, Tailwind, zod, pg, PGlite, supabase-js (storage only), Anthropic SDK, bcryptjs, jose, pdfjs-dist, exceljs, Vitest, Playwright.

## Global Constraints

- `docs/BUILD_CONTRACT.md` is binding: stack (section 2), environment (3), layout (4), adapter interfaces (5), service signatures (7), API (8), seed rules and expected numbers (9), scan pipeline (10), UI rules (11), scripts (12), definition of done (13).
- Files listed in contract section 1 are never modified.
- Runtime packages are limited to the list in contract section 2.
- Node 20.12 or newer, npm, no interactive prompts.
- Non-goals in `docs/DESIGN.md` section 4 are out of scope.
- The app must run with no environment file (local mode) and never require a cloud account to build or test.
- TDD: write the test, see it fail, implement, see it pass. Commit at the end of every task with the message shown.
- After every task append one line to `docs/BUILD_LOG.md`: task number, result, test counts, commit hash.

Test conventions: Vitest. Integration tests create an in-memory PGlite database, run `migrate`, and where stated
call `seedDatabase` with an in-memory `Storage` fake (a `Map`). Put the shared helper in `tests/helpers/db.ts`
exporting `freshDb()`, `seededDb()` and `memoryStorage()`. `seededDb()` caches nothing between files; seeding is fast.

---

### Task 1: Scaffold and tooling

**Files:** Create `package.json` (via scaffold), `next.config.*`, `vitest.config.ts`, `tsconfig.json` (via scaffold), `.gitignore`, `scripts/copy-pdf-worker.mjs`, `scripts/_env.ts`, `docs/DECISIONS.md`, `docs/BUILD_LOG.md`, `tests/helpers/` (empty for now).

- [ ] **Step 1:** `git init` if the folder is not a repository. Commit the kit as it stands: `chore: starter kit`.
- [ ] **Step 2:** Scaffold into a subfolder so nothing in the kit is overwritten:

```bash
npx --yes create-next-app@latest _scaffold --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --disable-git --yes
```

If a flag is rejected, remove that flag and rerun. Never answer a prompt.

- [ ] **Step 3:** Move everything from `_scaffold/` into the repo root except its `README.md`. `_scaffold/src/app` becomes `src/app`. Merge `.gitignore` and add `.data/`, `.data-e2e/`, `.env.local`, `public/pdf.worker.min.mjs`, `test-results/`, `playwright-report/`. Delete `_scaffold/`.
- [ ] **Step 4:** Install packages exactly as listed in contract section 2.
- [ ] **Step 5:** `next.config`: `serverExternalPackages` and the `X-Robots-Tag` header per contract section 2.
- [ ] **Step 6:** `vitest.config.ts`: node environment, include `tests/**/*.test.ts`, exclude `tests/e2e/**`, alias `@` to `src`.
- [ ] **Step 7:** `scripts/copy-pdf-worker.mjs` copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdf.worker.min.mjs` (create `public/` if missing; exit 0 with a warning if the source is absent). Add it as `postinstall`.
- [ ] **Step 8:** `scripts/_env.ts` exports `loadEnv()` that calls `process.loadEnvFile('.env.local')` when the file exists.
- [ ] **Step 9:** Add every script from contract section 12 to `package.json`. Scripts whose files do not exist yet are added now and implemented in later tasks.
- [ ] **Step 10:** Create `docs/DECISIONS.md` and `docs/BUILD_LOG.md` with a title line each.
- [ ] **Step 11:** Run `npx vitest run`. Expected: 3 files, 22 tests, all passing. Run `npm run typecheck`. Expected: no errors.
- [ ] **Step 12:** Commit: `task 1: scaffold and tooling`.

**Acceptance:** the 22 provided tests pass inside the scaffolded project; `npm run build` succeeds on the untouched scaffold.

---

### Task 2: Database adapters and migrations

**Files:** Create `src/server/db/types.ts`, `pg.ts`, `pglite.ts`, `migrate.ts`, `src/server/config.ts`, `src/server/container.ts`, `scripts/migrate.ts`, `tests/helpers/db.ts`, `tests/db/conformance.test.ts`, `tests/db/migrate.test.ts`.

**Interfaces:** Produces `Db`, `createPgDb(url)`, `createPgliteDb(dataDir?)`, `migrate(db, dir)`, `getConfig()`, `getDb()`, `freshDb()`. Contract sections 3 and 5.1.

- [ ] **Step 1:** Write `tests/db/conformance.test.ts`. One suite body run against PGlite always and against `createPgDb(process.env.TEST_DATABASE_URL)` when that variable is set. Cases:
  - a temp table with `integer`, `date`, `timestamptz`, `jsonb`, `text[]`, `boolean` columns round-trips `7`, `'2026-11-02'`, an ISO string, `{ a: [1, 2] }`, `['x', 'y']`, `true` with the JS types in the contract table;
  - `select count(*) as n` returns a JS number;
  - `tx` commits on success;
  - `tx` rolls back when the callback throws and rethrows the error;
  - `exec` runs a two-statement script.
- [ ] **Step 2:** Run it. Expected: fails, modules missing.
- [ ] **Step 3:** Implement `types.ts`, `pglite.ts`, `pg.ts` per contract 5.1.
- [ ] **Step 4:** Write `tests/db/migrate.test.ts`: migrating a fresh database creates the 11 tables and 2 views of `0001_init.sql`; a second `migrate` applies nothing; `schema_migrations` has one row.
- [ ] **Step 5:** Implement `migrate.ts`, `scripts/migrate.ts`, `tests/helpers/db.ts` (`freshDb`).
- [ ] **Step 6:** Implement `config.ts` (rules in contract section 3) and `container.ts` (`getDb`, memoised on `globalThis`; PGlite mode migrates on first use). Unit-test `getConfig` with injected env objects: no env gives local adapters; `DATABASE_URL` selects pg; `VERCEL=1` without `DATABASE_URL` throws naming `DATABASE_URL`; `AI_MODE` derivation.
- [ ] **Step 7:** Run all tests. Expected: pass.
- [ ] **Step 8:** Commit: `task 2: db adapters and migrations`.

---

### Task 3: Domain additions

**Files:** Create `src/domain/extraction.ts`, `requisition-input.ts`, `normalize.ts`, `tests/domain/extraction.test.ts`, `requisition-input.test.ts`, `normalize.test.ts`, `tests/fixtures/extraction/B-001.json`.

**Interfaces:** Contract section 6. Consumes `parse.ts`, `rules.ts`.

- [ ] **Step 1:** Create `tests/fixtures/extraction/B-001.json` from the worked example JSON in `contracts/extraction_prompt.md`.
- [ ] **Step 2:** Tests for `ExtractionResultSchema`: the fixture parses; a missing `lines` fails; an unknown flag string is dropped; `qty_each: "596"` fails.
- [ ] **Step 3:** Tests for `inferRequestDate`: the five rows of the table in contract 6.3.
- [ ] **Step 4:** Tests for `normalizeExtraction` using lookups built from `seed/master.json` (ids = index + 1):
  - the fixture gives crew STAGE_PREP, requester matched to Erick Hernandez, request date `2026-11-02` (today `2026-11-12`), two lines with parts matched, `qtyRequested` 596 and 149, `dateRequired` `2026-11-03`, both initialed, no warnings;
  - a line `part_number_raw: "60825"` resolves by alias and stays `isWriteIn`;
  - a line `qty_raw: "3 Boxes"`, `part_number_raw: "60825-300"` gets `qtyRequested` 1395, `packQty` 3, `packUnit` `box`;
  - a line with `qty_raw: "596 bolts"` and model `qty_each: 569` gets the flag `parse_mismatch`, confidence `medium`, `qtyRequested` 596;
  - `form.date_required_default_raw: "9/25/26"` with lines that have no dates gives every line `2026-09-25`;
  - an unknown `crew_code` gives `crewId` null and no warnings;
  - a Torque & Align extraction with quantities 170, 52, 4, 222, 444, 222 gives one `sum` warning;
  - `part_number_raw: "251025143?"` gives `partId` null and the flag `part_unresolved`.
- [ ] **Step 5:** Tests for `RequisitionInputSchema`: valid input passes; zero lines fails; a line with neither `partId` nor `partNumberRaw` fails; `sisInitialed` with null `qtyRequested` fails with the contract message; blank `pbLocationRaw` fails.
- [ ] **Step 6:** Implement the three modules. Run tests. Expected: pass.
- [ ] **Step 7:** Commit: `task 3: domain additions`.

---

### Task 4: Authentication

**Files:** Create `src/server/auth/password.ts`, `session.ts`, `guard.ts`, `src/server/http.ts`, `src/server/services/users.ts`, `audit.ts`, `src/app/api/auth/login/route.ts`, `logout/route.ts`, `change-password/route.ts`, `src/app/login/page.tsx`, `src/app/change-password/page.tsx`, `scripts/create-user.ts`, `tests/services/users.test.ts`, `tests/server/session.test.ts`.

**Interfaces:** Contract 5.4 and 7 (users.ts, audit.ts).

- [ ] **Step 1:** Tests (`users.test.ts`, fresh database): create then authenticate succeeds; email match is case-insensitive; wrong password is `invalid`; inactive user is `invalid`; the eighth consecutive failure locks and the next correct password returns `locked`; `resetPassword` clears the lock and sets `must_change_password`; `changePassword` rejects a wrong current password and a 9-character new one; the last active admin cannot be deactivated or demoted.
- [ ] **Step 2:** Tests (`session.test.ts`): a signed token verifies and yields the payload; a token signed with another secret is rejected; an expired token is rejected.
- [ ] **Step 3:** Implement `password.ts`, `session.ts`, `users.ts`, `audit.ts`, `http.ts` (`json`, typed `HttpError`, `handle(fn)` wrapper mapping errors to the status codes in contract section 8, `assertSameOrigin`).
- [ ] **Step 4:** Implement `guard.ts` and the three auth routes.
- [ ] **Step 5:** Login page: email, password, error text, submit. Change-password page: current, new, confirm; on success go to `/`. With no users in the database the login page shows "No users yet. Run `npm run seed`."
- [ ] **Step 6:** `scripts/create-user.ts` per contract section 12.
- [ ] **Step 7:** Run tests and typecheck. Expected: pass.
- [ ] **Step 8:** Commit: `task 4: authentication`.

---

### Task 5: Storage, lookups and the seed

**Files:** Create `src/server/storage/types.ts`, `local.ts`, `supabase.ts`, `src/server/services/lookups.ts`, `seed.ts`, `scripts/seed.ts`; extend `container.ts` (`getStorage`), `tests/helpers/db.ts` (`memoryStorage`, `seededDb`); create `tests/server/storage.test.ts`, `tests/services/seed.test.ts`.

**Interfaces:** Contract 5.2, 7 (lookups.ts), 9.

- [ ] **Step 1:** Tests (`storage.test.ts`): local driver in a temp directory round-trips bytes and content type; `get` of a missing key is null; `remove` deletes; a key containing `..` or a backslash is rejected.
- [ ] **Step 2:** Tests (`seed.test.ts`): after `seedDatabase` every row of the "After seeding" table in contract section 9 that concerns pages, requisitions, lines, sums, fingerprints, confidence and `needs_review` holds; read the expected numbers from `seed/seed_stats.json` where they exist there and hard-code the rest from the contract table. Also:
  - page `A-041` has status `duplicate`, points at page `A-037`, and shares requisition `MFR-000037`;
  - `MFR-000061` (page A-065) has 8 lines, the last with `part_id` null;
  - no requisition is verified; every requisition has `source 'seed'`;
  - 148 objects are in storage under `seed/`;
  - a second `seedDatabase` call changes no row counts;
  - the admin user can authenticate with the password passed in.
- [ ] **Step 3:** Implement storage drivers, `getStorage`, `lookups.ts`, `seed.ts`, `scripts/seed.ts` (local defaults and the generated password written to `${DATA_DIR}/admin-password.txt` and printed once).
- [ ] **Step 4:** Run tests. Then run `npm run seed` in local mode. Expected output includes `pages 148, requisitions 140, lines 424`.
- [ ] **Step 5:** Commit: `task 5: storage, lookups, seed`.

---

### Task 6: Scan services and AI adapter

**Files:** Create `src/server/ai/types.ts`, `anthropic.ts`, `mock.ts`, `off.ts`, `prompt.ts`, `src/server/services/scans.ts`; extend `container.ts` (`getAi`); create routes `api/lookups`, `api/batches`, `api/batches/[id]/pages`, `api/pages/[id]/extract`, `image`, `draft`, `reject`, `duplicate`, `reopen`; `scripts/preflight.ts`, `scripts/ai-check.ts`; tests `tests/services/scans.test.ts`, `tests/server/prompt.test.ts`.

**Interfaces:** Contract 5.3, 7 (scans.ts), 8.

- [ ] **Step 1:** Tests (`prompt.test.ts`): `buildSystemPrompt` on seeded lookups contains the line `STAGE_PREP - printed "STAGE & PREP"`, the row `25056-001  CENTER STRUCTURE TO BRACKET HARDWARE`, every active requester name, and no `{{`.
- [ ] **Step 2:** Tests (`scans.test.ts`, seeded database, memory storage, mock AI):
  - `addPage` stores both images and returns `uploaded`;
  - a second page with the same sha256 returns `duplicate` pointing at the first;
  - `extractPage` with the mock ends `needs_review` with the fixture stored and `extraction_model 'mock'`;
  - with AI off it ends `needs_review` with `extraction` null;
  - with an AI that throws it ends `failed` with the message stored, and a later call succeeds;
  - `getDraft` on the mock-read page returns the normalized draft and one duplicate reference, `MFR-000135`;
  - `rejectPage`, `markPageDuplicate`, `reopenPage` move statuses as specified and refuse from other statuses;
  - `nextPageToVerify` follows batch then page order;
  - `getPageImage` returns the stored bytes for `full` and `detail`, and null for a missing detail.
- [ ] **Step 3:** Implement `prompt.ts`, the three AI drivers, `getAi`, `scans.ts`.
- [ ] **Step 4:** Implement the routes with session checks, same-origin checks, size and JPEG checks.
- [ ] **Step 5:** Implement `scripts/preflight.ts` and `scripts/ai-check.ts`. If `ANTHROPIC_API_KEY` is present in the environment, run `npm run ai:check` once now and commit `docs/AI_CHECK.md`. If it fails or the key is absent, note that in BUILD_LOG and continue.
- [ ] **Step 6:** Run tests. Expected: pass.
- [ ] **Step 7:** Commit: `task 6: scans and ai`.

---

### Task 7: Requisition services

**Files:** Create `src/server/services/requisitions.ts`; routes `api/requisitions`, `api/requisitions/[id]`, `verify`, `void`, `api/lines/mark-issued`; `tests/services/requisitions.test.ts`.

**Interfaces:** Contract 7 (requisitions.ts), 8.

- [ ] **Step 1:** Tests (seeded database):
  - saving a manual TUBES requisition for PB `110` with one line `2 Pallets` of 25244-000 (each 7680, initialed) returns `MFR-000141`, is verified, has `qty_issued` 7680 and `pb_number` 110;
  - saving input identical to MFR-000135 (STAGE_PREP, PB 103, 2026-11-02, 596 and 149) returns the duplicate reference and writes nothing; with `duplicateAcknowledged` it saves;
  - saving with `scanPageId` of a `needs_review` page sets the page `posted` and links it; a page in another status is refused;
  - line order is preserved as `line_no`;
  - `updateRequisition` changes a quantity, recomputes `qty_issued` and the fingerprint, keeps the number, and writes an audit entry with before and after;
  - updating a void requisition is refused;
  - `markLinesIssued` on the two lines of MFR-000006 (page A-006, not initialed) updates 2, sets `issued_on`, and the tracker pending count drops from 58 to 56; a line with no each-count is skipped;
  - `verifyRequisition` sets `verified_at`; `voidRequisition` requires a reason and removes its lines from `v_pb_part_matrix`;
  - a database write that violates the issue rule is rejected by the constraint.
- [ ] **Step 2:** Implement the service and routes.
- [ ] **Step 3:** Run tests. Expected: pass.
- [ ] **Step 4:** Commit: `task 7: requisitions`.

---

### Task 8: Tracker, matrix, export, dashboard, master data services

**Files:** Create `src/server/services/tracker.ts`, `matrix.ts`, `export.ts`, `dashboard.ts`, `parts.ts`, `crews.ts`, `people.ts`; routes `api/tracker/export`, `api/matrix/export`, `api/parts`, `api/parts/[id]`, `api/parts/[id]/merge`, `api/crews`, `api/crews/[id]`, `api/people`, `api/people/[id]`, `api/users`, `api/users/[id]`; tests `tests/services/tracker.test.ts`, `matrix.test.ts`, `export.test.ts`, `dashboard.test.ts`, `parts.test.ts`.

**Interfaces:** Contract 7, 8.

- [ ] **Step 1:** Tests (`tracker.test.ts`, seeded): each tracker row of the contract section 9 table (`crew=MIBS`, `crew=TORQUE_ALIGN`, October range, `pb=37`, `pb=81-90`, `issue=pending`); `pb=for ldys` returns the one MISC line; `review` returns lines of 38 requisitions; `unresolved` returns 1 line; `q=MFR-000135` returns 2 lines; paging returns 100 rows on page 1 and 24 on page 5 with `totalLines` 424; default sort starts with the newest request date; `parseTrackerFilters` round-trips repeated `crew` and `part` parameters and ignores unknown keys.
- [ ] **Step 2:** Tests (`matrix.test.ts`): 52 rows, 20 columns, 409 cells, 13 cells with `requisitionCount` above 1; cell PB 37 / 25233-00 is 440 with count 2; numeric rows come before `FOR LDYs`; `verifiedOnly` on a fresh seed gives no cells; after verifying MFR-000037 it gives that requisition's two cells; row and column totals each add up to 910,880 in issued mode (910,895 less the one 15-piece line that has no matched part).
- [ ] **Step 3:** Tests (`export.test.ts`): CSV starts with a BOM and the exact header line from contract 7; has 425 lines for the unfiltered seed; a field containing a comma or quote is quoted; XLSX opens with `exceljs`, sheet `Tracker` has 425 rows, row 1 bold, `Qty Requested` cells numeric, `Request Date` cells are dates.
- [ ] **Step 4:** Tests (`dashboard.test.ts`, seeded): `pagesToVerify` 0, `pagesFailed` 0, `backlogUnverified` 140, `flaggedReads` 38, `linesPending` 58, `partsToConfirm` 5, `linesUnresolved` 1, `repeatIssues` 13, `recent` has 10 entries.
- [ ] **Step 5:** Tests (`parts.test.ts`): the merge row of the contract section 9 table; merging a part into itself is refused; creating a part stores the number uppercased; a duplicate part number is a 409-class error; aliases are replaced on update; saving a crew replaces its ordered part list.
- [ ] **Step 6:** Implement services and routes (admin checks on mutations).
- [ ] **Step 7:** Run tests. Expected: pass.
- [ ] **Step 8:** Commit: `task 8: tracker, matrix, export, master data`.

---

### Task 9: App shell and dashboard

**Files:** Create `src/components/ui/*` (Button, Input, Select, Checkbox, Badge, Dialog, Toast, Table, Tabs), `src/app/layout.tsx`, `globals.css`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`. Remove the scaffold's sample page and assets.

- [ ] **Step 1:** UI primitives: small, typed, Tailwind only, visible focus rings. `Dialog` on the native `<dialog>` element. `Toast` as a client provider in the app layout.
- [ ] **Step 2:** `(app)/layout.tsx`: `requirePageUser()`, top bar per DESIGN 8 with the Inbox count from `countPagesByStatus`, user menu (Change password, Sign out), Admin menu for admins only.
- [ ] **Step 3:** Dashboard: the eight tiles from `getDashboard`, each linking to `/inbox?tab=review`, `/inbox?tab=failed`, `/tracker?verified=no`, `/tracker?review=1&verified=no`, `/tracker?issue=pending`, `/admin/parts?review=1`, `/tracker?unresolved=1`, `/matrix`. Recent requisitions table below.
- [ ] **Step 4:** Start the dev server against the seeded local database and fetch `/login` and `/` with a session cookie obtained from `POST /api/auth/login`. Expected: 200, and the dashboard HTML contains `140` and `58`.
- [ ] **Step 5:** Commit: `task 9: shell and dashboard`.

---

### Task 10: Inbox and the browser scan pipeline

**Files:** Create `src/components/scan/canvas.ts`, `pdf.ts`, `pipeline.ts`, `UploadZone.tsx`, `PageCard.tsx`, `src/app/(app)/inbox/page.tsx`, `tests/components/pipeline.test.ts`.

**Interfaces:** Contract section 10. Consumes `detectRotation`.

- [ ] **Step 1:** Tests (`pipeline.test.ts`, node): the queue runner in `pipeline.ts` is written against injected functions (`render`, `upload`, `extract`), so test it without a browser: never more than 3 pages in flight; a page whose upload rejects is marked `failed` and the rest finish; a page returned as `duplicate` is not sent to `extract`; progress callbacks fire in the order rendering, uploading, reading, ready.
- [ ] **Step 2:** Implement `canvas.ts`, `pdf.ts`, `pipeline.ts` per contract section 10.
- [ ] **Step 3:** `UploadZone`: drag and drop plus file picker, per-page progress list, 300-page limit message, "check rotation" hint when rotation was not confident.
- [ ] **Step 4:** Inbox page: tabs with counts (To verify, Processing, Failed, Duplicates, Rejected, Posted), 50 cards per tab with "Load more", card actions per DESIGN 8.2. The To verify tab has a "Start verifying" button to the first page in the queue.
- [ ] **Step 5:** Typecheck and build. Expected: pass.
- [ ] **Step 6:** Commit: `task 10: inbox and scan pipeline`.

---

### Task 11: Verify screen, requisition screen, manual entry

**Files:** Create `src/components/verify/ImagePane.tsx`, `RequisitionForm.tsx`, `LinesEditor.tsx`, `DuplicateBanner.tsx`, `CheckWarnings.tsx`, `form-state.ts`, `src/app/(app)/verify/[pageId]/page.tsx`, `requisitions/new/page.tsx`, `requisitions/[id]/page.tsx`, `tests/components/form-state.test.ts`.

**Interfaces:** Consumes `Draft`, `Lookups`, `RequisitionInput`, `parseQty`, `resolvePart`, `runCrewChecks`.

- [ ] **Step 1:** Put the form logic in `form-state.ts` as pure functions over a plain state object so it is testable without React: `fromDraft`, `fromRequisition`, `emptyForCrew(crew, lookups)`, `setAsWritten(state, lineIndex, text)`, `setEach(state, lineIndex, value)`, `setPart(state, lineIndex, text)`, `toggleAll(state, checked)`, `addLine`, `removeLine`, `toInput(state, duplicateAcknowledged)`, `warnings(state, lookups)`.
- [ ] **Step 2:** Tests (`form-state.test.ts`):
  - `emptyForCrew` for TORQUE_ALIGN gives six rows in crew order with the default requester;
  - `setAsWritten('2 Pallets')` on a 25244-000 row fills each 7680, pack 2 pallet;
  - after `setEach` by hand, `setAsWritten` no longer overwrites the each-count;
  - `setPart('60825')` resolves to 60825-300; `setPart('99999-000')` leaves `partId` null and keeps the text;
  - `toInput` drops rows with no quantity text and no each-count, and keeps line order;
  - `warnings` returns the `sum` warning for 170, 52, 4, 222, 444, 222 and nothing once 170 becomes 166;
  - `toggleAll(true)` leaves rows with no each-count unticked.
- [ ] **Step 3:** `ImagePane`: wheel zoom, drag pan, fit, whole/detail toggle, Rotate 90° (contract 10 step 10).
- [ ] **Step 4:** `RequisitionForm` and `LinesEditor` per DESIGN 8.3 and contract 11: amber outlines and notes for non-high confidence, datalist part picker, Ctrl+Enter, Alt+N.
- [ ] **Step 5:** Verify page: loads the draft, shows the duplicate banner when `duplicates` is non-empty, buttons Skip (next in queue), Reject, Mark duplicate, Post. Handles 409 and 422 responses.
- [ ] **Step 6:** Requisition page: header with number, badges (Unverified, Void, source), the form in edit mode, the image pane when a scan page exists, Mark verified, Void (admin, asks for a reason), history list from the audit entries. "Next unverified" button goes to the next unverified requisition by number.
- [ ] **Step 7:** New requisition page: crew first, then the form with no image pane.
- [ ] **Step 8:** Run tests, typecheck, build. Expected: pass.
- [ ] **Step 9:** Commit: `task 11: verify and requisition screens`.

---

### Task 12: Tracker and matrix pages

**Files:** Create `src/components/tracker/FilterBar.tsx`, `TrackerTable.tsx`, `src/components/matrix/MatrixTable.tsx`, `src/app/(app)/tracker/page.tsx`, `matrix/page.tsx`.

- [ ] **Step 1:** Tracker page per DESIGN 8.5: GET-form filter bar, table columns Req #, Date, Crew, Requester, PB, Part, As written, Requested, Issued, Need by, Status, flags badge, verified tick. Footer totals from `queryTracker`. Pager. Export buttons that keep the current filters. Checkbox selection of pending rows and a "Mark issued" dialog with a date (default today).
- [ ] **Step 2:** Matrix page per DESIGN 8.6: sticky first column and header row, crew group headers over the part columns, amber cells with the count badge, toggles as links that keep the other toggle, totals, cell links to `/tracker?pb=..&part=..`, export button.
- [ ] **Step 3:** With the dev server on the seeded database, fetch `/tracker?crew=MIBS` and `/matrix` with a session. Expected: the tracker HTML contains `108` and `468,104`; the matrix HTML contains a cell with `440` and the `x2` badge in the PB 37 row.
- [ ] **Step 4:** Commit: `task 12: tracker and matrix pages`.

---

### Task 13: Admin pages

**Files:** Create `src/app/(app)/admin/parts/page.tsx`, `crews/page.tsx`, `people/page.tsx`, `users/page.tsx`, and client components beside them as needed.

- [ ] **Step 1:** Each page calls `requirePageUser()` and returns the 403 screen for non-admins.
- [ ] **Step 2:** Parts: table with search and a "Needs review" filter (`?review=1`), edit dialog (descriptions, pack sizes, needs review, notes, active, aliases as a comma list), "Merge into" dialog with a part picker and a confirmation that names both parts and the number of lines that will move.
- [ ] **Step 3:** Crews: list, edit dialog with name, default requester, active, and an ordered part list (add, remove, move up, move down).
- [ ] **Step 4:** People: list and edit dialog.
- [ ] **Step 5:** Users: list, create (shows the temporary password once), edit role and active, reset password.
- [ ] **Step 6:** Typecheck and build. Expected: pass.
- [ ] **Step 7:** Commit: `task 13: admin pages`.

---

### Task 14: End-to-end smoke test

**Files:** Create `playwright.config.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/smoke.spec.ts`.

- [ ] **Step 1:** `npx playwright install chromium`. If this fails, record it in DECISIONS.md, skip the rest of this task, and continue with Task 15.
- [ ] **Step 2:** Config: web server command `npm run build && npm run start -- -p 3100`, base URL `http://localhost:3100`, environment `DATA_DIR=.data-e2e`, `AI_MODE=mock`, `ADMIN_EMAIL=admin@local.test`, `ADMIN_PASSWORD=LocalTest#12345`, `SEED_SKIP_PASSWORD_CHANGE=1`. Global setup deletes `.data-e2e` and runs the seed with the same environment before the server starts.
- [ ] **Step 3:** One spec, in order:
  1. Sign in. The dashboard shows Backlog to verify `140` and Lines pending issue `58`.
  2. Tracker filtered to crew MIBS shows `108` lines.
  3. Matrix shows the amber `x2` cell in the PB 37 row.
  4. Inbox: upload `seed/pages/B-001.jpg`. Wait for the card to reach To verify. Open it. The form shows `596` and `149`. The duplicate banner names `MFR-000135`. Click Mark duplicate. The page appears under Duplicates.
  5. New requisition: crew MISC TUBES, PB `110`, today's date, as written `2 Pallets`, initialed. Post. The requisition page shows `MFR-000141` and each `7,680`.
  6. Tracker search `MFR-000141` shows one line with issued `7,680`.
  7. Download the CSV export and check its first line is the contract header.
- [ ] **Step 4:** Run `npm run e2e`. Fix the app, not the test, when a step fails.
- [ ] **Step 5:** Commit: `task 14: e2e smoke`.

---

### Task 15: Cloud drivers check, go-live script, documents

**Files:** Create `scripts/go-live.ts`, `docs/GO_LIVE.md`, `docs/HANDOFF.md`, `README.md`; update `.env.example` only if a variable was added.

- [ ] **Step 1:** `scripts/go-live.ts` per contract section 12. It must refuse to run without `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, naming the missing ones.
- [ ] **Step 2:** Run `npm run preflight`. Do not open `.env.local` yourself. If preflight reports the cloud variables as set: run `npm run go-live`, then run the conformance test once with `TEST_DATABASE_URL` taken from `DATABASE_URL` inside a small script (never echo the value). Record the outcome in BUILD_LOG. If preflight reports local mode, skip the rest of this step.
- [ ] **Step 3:** `docs/GO_LIVE.md`: numbered steps for the owner. Create the Supabase project; copy the transaction pooler connection string, the project URL and a secret key; generate `SESSION_SECRET` (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`); fill `.env.local`; `npm run go-live`; push to GitHub; import in Vercel; add the same variables in Vercel plus `ANTHROPIC_API_KEY`; deploy; sign in; create team users in Admin > Users. Include how to rotate the secret key and how to back up (Supabase dashboard).
- [ ] **Step 4:** `README.md`: what the app is, local quick start (three commands), scripts table, where the documents are.
- [ ] **Step 5:** `docs/HANDOFF.md`: what was built, test counts, anything skipped and why (from DECISIONS.md), the admin login location for local mode, the open items for the owner from DESIGN 11.
- [ ] **Step 6:** Commit: `task 15: go-live and documents`.

---

### Task 16: Final verification

- [ ] **Step 1:** Fresh clone into a temp folder, `npm install`, `npm run verify`. Expected: all green. Paste the summary lines into BUILD_LOG.
- [ ] **Step 2:** In that clone: `npm run seed`, start the app, sign in with the generated admin password, load the dashboard, tracker and matrix once each. Expected: 200 responses and the seeded numbers.
- [ ] **Step 3:** `git status` in the real repo shows no changes to any file listed in contract section 1 (`git diff --stat <first commit> -- db/migrations/0001_init.sql src/domain/types.ts src/domain/parse.ts src/domain/rules.ts src/domain/orientation.ts tests/domain contracts seed` prints nothing).
- [ ] **Step 4:** Search the repo for secrets (`sb_secret_`, `sk-ant-`, the session secret value). Expected: none outside `.env.local`.
- [ ] **Step 5:** Walk the definition of done in contract section 13 and tick each item in HANDOFF.md.
- [ ] **Step 6:** Commit: `task 16: final verification`. Stop. Print the path to `docs/HANDOFF.md`.
