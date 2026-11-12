# MFR Tracker - Build Contract

Version 1.0, 2026-11-12. Read `docs/DESIGN.md` first for the what and why. This file locks the how.
`docs/BUILD_PLAN.md` is the ordered task list. Where this file and the plan disagree, this file wins.

Every decision here is final for v1. If something is missing or turns out to be impossible, follow
`CLAUDE.md`: choose the option closest to DESIGN.md, record it in `docs/DECISIONS.md`, keep going.

## 1. What is already in the repo

Provided and tested. Use as is.

| Path | What | Rule |
|---|---|---|
| `db/migrations/0001_init.sql` | Full schema and two views. Ran on PostgreSQL with the seed loaded. | Never edit. Schema changes go in a new numbered file and get logged in DECISIONS.md. |
| `src/domain/types.ts`, `parse.ts`, `rules.ts`, `orientation.ts` | Parsers, issue rule, fingerprint, part matching, crew checks, auto-rotation. | Do not rewrite. Add functions in new files. |
| `tests/domain/*.test.ts` | 22 passing tests, including every value written on the 148 forms. | Must keep passing unchanged. |
| `contracts/extraction.schema.json` | AI output shape. | Field names and meanings are fixed. |
| `contracts/extraction_prompt.md` | AI system prompt and request layout. | Copy the prompt text verbatim. |
| `seed/master.json` | 22 parts, 7 crews, 7 people, 4 aliases. | Data, do not edit. |
| `seed/seed.json` | 148 pages: 140 requisitions, 424 lines, 8 duplicates. | Data, do not edit. |
| `seed/seed_stats.json` | Expected totals after seeding. | Test oracle. |
| `seed/parse_vectors.json` | 462 parser cases. | Test oracle. |
| `seed/pages/*.jpg` | 148 upright page images, 1600 px wide. | Uploaded to storage by the seed script. |
| `seed/reference_import.mjs` | Runnable statement of the seed import rules. | Reference only. |
| `seed/seed_preview.csv` | Flat view of the seed for a human. | Not used by code. |

## 2. Stack

| Concern | Choice |
|---|---|
| Runtime | Node 20.12 or newer. npm. |
| Framework | Next.js, latest stable, App Router, TypeScript strict, `src/` directory, import alias `@/*` |
| Styling | Tailwind CSS as scaffolded. Hand-written components in `src/components/ui`. No component library, no CDN assets, system fonts. |
| Validation | zod |
| Database | PostgreSQL. `pg` when `DATABASE_URL` is set, otherwise `@electric-sql/pglite` (embedded). Hand-written SQL. No ORM. |
| File storage | Supabase Storage through `@supabase/supabase-js` when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set, otherwise local disk. |
| Auth | `bcryptjs` + `jose` (HS256 JWT in an httpOnly cookie). No Supabase Auth. No middleware or proxy file. |
| AI | `@anthropic-ai/sdk`, Messages API, two images per page, structured output. |
| PDF in browser | `pdfjs-dist` |
| Excel export | `exceljs` |
| Tests | Vitest (unit and integration on PGlite). Playwright for one smoke test. |
| Script runner | `tsx` |

Install exactly these runtime packages: `pg @electric-sql/pglite @supabase/supabase-js @anthropic-ai/sdk zod bcryptjs jose pdfjs-dist exceljs`.
Dev packages: `vitest tsx @types/pg @types/bcryptjs @playwright/test`.
Anything else needs an entry in DECISIONS.md saying why.

`next.config`: set `serverExternalPackages: ['@electric-sql/pglite', 'pg', 'exceljs']` and a `headers()` entry adding
`X-Robots-Tag: noindex, nofollow` to every route.

## 3. Modes and environment

Adapters are chosen independently:

| Adapter | Cloud driver when | Otherwise |
|---|---|---|
| Db | `DATABASE_URL` set | PGlite at `${DATA_DIR}/pg` |
| Storage | `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set | Disk at `${DATA_DIR}/storage` |
| AI | `AI_MODE=anthropic`, or unset with `ANTHROPIC_API_KEY` present | `AI_MODE=mock` returns a fixture; otherwise off |

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | cloud | none | Supabase transaction pooler string (port 6543). |
| `SUPABASE_URL` | cloud | none | `https://<ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | cloud | none | `sb_secret_...`. Server only. A legacy `service_role` JWT also works. |
| `STORAGE_BUCKET` | no | `mfr-scans` | Private bucket. |
| `SESSION_SECRET` | cloud | generated | At least 32 characters. Local mode generates one into `${DATA_DIR}/session-secret`. |
| `ANTHROPIC_API_KEY` | for AI | none | |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5-5` | `npm run preflight` checks it against the Models API. |
| `AI_MODE` | no | derived | `anthropic`, `mock`, `off` |
| `DATA_DIR` | no | `.data` | Local database, storage, generated secrets. Git-ignored. |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | seed in cloud | local: `admin@local.test`, `Site Admin`, generated | Used by `npm run seed`. |
| `SEED_SKIP_PASSWORD_CHANGE` | no | unset | `1` creates the admin without the forced password change. E2E only. |
| `TEST_DATABASE_URL` | no | none | When set, the Db conformance test also runs against real Postgres. |

Rules:

- If `process.env.VERCEL` is set and `DATABASE_URL` is missing, throw at startup with a message naming the missing variables.
- In PGlite mode the app runs pending migrations on first database use. With `DATABASE_URL`, only `npm run db:migrate` migrates.
- Scripts load `.env.local` themselves through `process.loadEnvFile` when the file exists.
- Never log or print a secret. `preflight` prints only which variables are set.

## 4. Directory layout

```
mfr-tracker/
  CLAUDE.md  README.md  README_START_HERE.md  .env.example
  contracts/                      (provided)
  db/migrations/0001_init.sql     (provided)
  docs/  DESIGN.md  BUILD_CONTRACT.md  BUILD_PLAN.md  DECISIONS.md  BUILD_LOG.md  HANDOFF.md  GO_LIVE.md
  seed/                           (provided)
  scripts/
    _env.ts  migrate.ts  seed.ts  create-user.ts  preflight.ts  go-live.ts  ai-check.ts  copy-pdf-worker.mjs
  src/
    domain/                       pure logic, no I/O, no framework imports
      types.ts parse.ts rules.ts orientation.ts      (provided)
      extraction.ts               zod schema + TS type for ExtractionResult
      normalize.ts                extraction -> draft form; inferRequestDate
      requisition-input.ts        zod schema for RequisitionInput
    server/
      config.ts  container.ts
      db/      types.ts  pg.ts  pglite.ts  migrate.ts
      storage/ types.ts  local.ts  supabase.ts
      ai/      types.ts  anthropic.ts  mock.ts  off.ts  prompt.ts
      auth/    password.ts  session.ts  guard.ts
      services/ users.ts  lookups.ts  scans.ts  requisitions.ts  tracker.ts  matrix.ts  parts.ts  crews.ts  people.ts  dashboard.ts  seed.ts  audit.ts  export.ts
      http.ts                     json(), error mapping, origin check
    app/
      layout.tsx  globals.css
      login/page.tsx  change-password/page.tsx
      (app)/layout.tsx            requires a session, renders the top bar
      (app)/page.tsx              dashboard
      (app)/inbox/page.tsx
      (app)/verify/[pageId]/page.tsx
      (app)/requisitions/new/page.tsx
      (app)/requisitions/[id]/page.tsx
      (app)/tracker/page.tsx
      (app)/matrix/page.tsx
      (app)/admin/parts/page.tsx  crews/page.tsx  people/page.tsx  users/page.tsx
      api/...                     route handlers, section 8
    components/
      ui/        Button Input Select Checkbox Badge Dialog Toast Table Tabs
      scan/      UploadZone.tsx  pipeline.ts  pdf.ts  canvas.ts  PageCard.tsx
      verify/    ImagePane.tsx  RequisitionForm.tsx  LinesEditor.tsx  DuplicateBanner.tsx  CheckWarnings.tsx
      tracker/   FilterBar.tsx  TrackerTable.tsx
      matrix/    MatrixTable.tsx
  tests/
    domain/                       (provided) + extraction, normalize, requisition-input
    db/conformance.test.ts
    services/*.test.ts            integration on in-memory PGlite
    fixtures/extraction/B-001.json
    e2e/smoke.spec.ts
```

Layering: `domain` imports nothing outside `domain`. `server/services` import `domain` and adapter
interfaces only, and take their adapters as arguments. `app/api` and server components get adapters from
`server/container.ts` and call services. Client components never import from `server/`.

## 5. Adapters

### 5.1 Db

```ts
// src/server/db/types.ts
export interface Db {
  /** Parameterised query. Placeholders are $1, $2, ... Returns rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Multi-statement script with no parameters (migrations). */
  exec(sql: string): Promise<void>;
  /** Runs fn in one transaction. Commit on resolve, rollback on throw. Nested calls are not allowed. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
```

Both drivers must hand back the same JavaScript values:

| Postgres type | JS value | How |
|---|---|---|
| `integer` | number | default |
| `bigint` (OID 20) | number | parser `Number` |
| `date` (1082) | `'YYYY-MM-DD'` string | parser identity |
| `timestamptz` (1184) | ISO 8601 string | parser `v => new Date(v).toISOString()` |
| `jsonb` | parsed value | default |
| `text[]` | string array | default |
| `boolean` | boolean | default |

Parameter conventions: pass `jsonb` as `JSON.stringify(value)` with a `::jsonb` cast in the SQL. Pass `text[]`
as a JS string array. Cast aggregates in SQL (`count(*)::integer`, `sum(x)::integer`).

`pg.ts`: one `Pool` with `max: 3`, `ssl: { rejectUnauthorized: false }`, type parsers set with
`pg.types.setTypeParser`. `tx` checks out one client, `BEGIN`, runs `fn` with a Db bound to that client,
`COMMIT` or `ROLLBACK`, releases. Never use named prepared statements (transaction pooler).

`pglite.ts`: `new PGlite(dataDir, { parsers })`, or no `dataDir` for in-memory. `exec` maps to PGlite `exec`,
`tx` to PGlite `transaction`. The verified call shape is in `seed/reference_import.mjs`. Check the installed
version's API before relying on option names.

`migrate.ts`: `migrate(db, dir)` creates `schema_migrations(filename text primary key, applied_at timestamptz not null default now())`,
then applies each `*.sql` in name order that is not recorded, each in its own transaction, and records it.

### 5.2 Storage

```ts
// src/server/storage/types.ts
export interface Storage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  remove(key: string): Promise<void>;
}
```

Keys: uploaded pages `scans/{batchId}/{pageNumber}.jpg` and `scans/{batchId}/{pageNumber}.detail.jpg`.
Seed pages `seed/{page_key}.jpg`. Keys match `^[a-zA-Z0-9/_.\-]+$`; reject anything else.

`local.ts` writes under `${DATA_DIR}/storage/`. `supabase.ts` uses
`createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(bucket)`
with `upload(key, bytes, { contentType, upsert: true })` and `download(key)`. It also exports
`ensureBucket()` which creates the private bucket and ignores "already exists".

### 5.3 AI

```ts
// src/server/ai/types.ts
import type { ExtractionResult } from '@/domain/extraction';
export interface AiExtractor {
  readonly enabled: boolean;
  readonly modelId: string;            // 'off', 'mock', or the Anthropic model id
  extract(input: { system: string; full: Uint8Array; detail: Uint8Array | null }): Promise<ExtractionResult>;
}
```

`anthropic.ts`:

- One Messages request per page. `system` from `prompt.ts`. User content: image block for `full`
  (base64, `image/jpeg`), image block for `detail` when present, then the user text from `contracts/extraction_prompt.md`.
- `max_tokens: 4000`. Do not set temperature or thinking parameters.
- Structured output through `output_config.format` with `type: "json_schema"` and the schema from
  `contracts/extraction.schema.json`. Read the current rules at
  https://platform.claude.com/docs/en/build-with-claude/structured-outputs before coding and adapt schema
  syntax to the documented limitations if needed.
- Parse the text block as JSON and validate with the zod schema in `src/domain/extraction.ts`.
- On an API rejection of the schema or on a validation failure: retry once without `output_config`, asking in
  the user text for "JSON only, matching this schema", strip code fences, validate. A second failure throws
  `ExtractionError` with a short message.
- Client timeout 55 seconds, `maxRetries: 1`.

`mock.ts`: returns the content of `tests/fixtures/extraction/B-001.json` for every page. Import the JSON statically so it is bundled into the production build. `off.ts`: `enabled: false`; `extract` throws.

`prompt.ts`: `buildSystemPrompt(lookups)` fills `{{CREWS_BLOCK}}` and `{{REQUESTERS_BLOCK}}` exactly as
described in `contracts/extraction_prompt.md`.

### 5.4 Session

- Cookie `mfr_session`: JWT HS256 signed with `SESSION_SECRET`, payload `{ sub: userId, role, name }`, 12 hour expiry.
  `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `secure` when `NODE_ENV === 'production'`.
- `guard.ts`: `getSession()` (null when absent or invalid), `requirePageUser()` (redirects to `/login`, or to
  `/change-password` when `must_change_password`), `requireApiUser(req)` and `requireApiAdmin(req)` (throw typed
  errors mapped to 401 and 403). Each call re-reads `is_active` and `role` from the database.
- Mutating route handlers call `assertSameOrigin(req)`: when an `Origin` header is present its host must equal the `Host` header, else 403.
- `password.ts`: bcrypt cost 11. Policy: 10 characters minimum.
- Login: look up by lowercased email; inactive or unknown gives the same 401 as a wrong password; `locked_until`
  in the future gives 423; a failure increments `failed_logins` and at 8 sets `locked_until = now() + 15 minutes`
  and resets the counter; success resets the counter and sets `last_login_at`.

## 6. Domain additions

### 6.1 `src/domain/extraction.ts`

zod schema `ExtractionResultSchema` mirroring `contracts/extraction.schema.json` exactly, and
`export type ExtractionResult = z.infer<typeof ExtractionResultSchema>`. Unknown flag strings are dropped, not rejected.

### 6.2 `src/domain/requisition-input.ts`

```ts
export interface RequisitionLineInput {
  partId: number | null;
  partNumberRaw: string | null;
  descriptionRaw: string | null;
  isWriteIn: boolean;
  qtyRaw: string | null;
  qtyRequested: number | null;        // each-count, integer >= 0
  packQty: number | null;
  packUnit: 'box' | 'pallet' | null;
  unitWord: string | null;
  dateRequired: string | null;        // ISO date
  sisInitialed: boolean;
  confidence: 'high' | 'medium' | 'low';
  flags: string[];
  note: string | null;
}
export interface RequisitionInput {
  crewId: number;
  requesterId: number | null;
  requesterNameRaw: string | null;
  pbLocationRaw: string;              // non-empty after trim
  requestDate: string;                // ISO date
  approverId: number | null;
  approvalSignaturePresent: boolean | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  flags: string[];
  lines: RequisitionLineInput[];      // at least one
  duplicateAcknowledged: boolean;
}
```

Validation beyond types: each line needs `partId` or a non-empty `partNumberRaw`; each line needs `qtyRaw` or
`qtyRequested`; a line with `sisInitialed` true and `qtyRequested` null is rejected with the message
"Enter a quantity before marking a line as issued."

### 6.3 `src/domain/normalize.ts`

```ts
export interface Lookups {
  crews: Array<{ id: number; code: string; name: string; defaultRequesterId: number | null; checks: CrewCheck[];
                 parts: Array<{ partId: number; partNumber: string; label: string }> }>;
  parts: Array<{ id: number; partNumber: string; label: string; eachPerBox: number | null; eachPerPallet: number | null;
                 needsReview: boolean; isActive: boolean }>;
  aliases: Array<{ alias: string; partId: number }>;
  people: Array<{ id: number; fullName: string; isRequester: boolean; isApprover: boolean; isActive: boolean }>;
}
export interface DraftLine extends RequisitionLineInput { dateRequiredRaw: string | null }
export interface Draft {
  form: Omit<RequisitionInput, 'lines' | 'duplicateAcknowledged' | 'crewId' | 'requestDate'> & {
    crewId: number | null; requestDate: string | null; requestDateRaw: string | null };
  lines: DraftLine[];
  warnings: CheckWarning[];
}
export function inferRequestDate(raw: string | null, today: string): string | null;
export function normalizeExtraction(x: ExtractionResult, lookups: Lookups, today: string): Draft;
```

`inferRequestDate`: `parseDate(raw, { defaultYear: year of today })`. If the text carried no year and the result is
more than 60 days after `today`, subtract one year. Required cases:

| raw | today | result |
|---|---|---|
| `9-8` | 2026-11-12 | 2026-09-08 |
| `12-28` | 2027-01-05 | 2026-12-28 |
| `1-3` | 2026-12-30 | 2027-01-03 |
| `9-8-26` | 2030-01-01 | 2026-09-08 |
| `soon` | 2026-11-12 | null |

`normalizeExtraction`:

1. Crew: active crew whose `code` equals `form.crew_code`, else null.
2. Requester: case-insensitive match of `form.requester` on `people.fullName` gives `requesterId`; `requesterNameRaw` always keeps the text.
3. `pbLocationRaw`: the text, or `''`.
4. `requestDate`: `inferRequestDate(form.request_date_raw, today)`.
5. Default need-by date: `parseDate(form.date_required_default_raw, { defaultYear, anchor: requestDate })`, else the first line date that parses.
6. Per line, in order:
   - `resolvePart(part_number_raw, parts, aliases)` gives `partId`. No match adds the flag `part_unresolved`.
   - `parseQty(qty_raw, pack sizes of the matched part)`; `qtyRequested`, `packQty`, `packUnit`, `unitWord` come from the parser; parser flags are merged in.
   - If the model's `qty_each` and the parser's `qtyEach` differ (including exactly one being null), add `parse_mismatch` and cap confidence at `medium`.
   - `dateRequired`: the line's own parsed date, else the default from step 5.
   - `sisInitialed`, `isWriteIn`, `note` pass through. Flags are de-duplicated and sorted.
7. `warnings`: `runCrewChecks(crew.checks, lines)` when the crew is known.

## 7. Services

All in `src/server/services`, all take `Db` first. Signatures are fixed; internals are free.

### users.ts

```ts
createUser(db, { email, fullName, initials, role, password, mustChangePassword }): Promise<{ id: number }>
authenticate(db, email, password): Promise<{ ok: true; user: SessionUser & { mustChangePassword: boolean } } | { ok: false; reason: 'invalid' | 'locked' }>
changePassword(db, userId, currentPassword, newPassword): Promise<void>
listUsers(db), updateUser(db, id, { role?, isActive?, fullName?, initials? }), resetPassword(db, id, newPassword)
```

Email is stored lowercased. `resetPassword` sets `must_change_password` true and clears the lockout. An admin cannot
deactivate or demote themselves if they are the last active admin.

### lookups.ts

`getLookups(db): Promise<Lookups>`. `label` is `field_name`, falling back to `description_official`, then the part number.

### scans.ts

```ts
createBatch(db, { filename, pageCount, userId }): Promise<{ id: number }>
addPage(db, storage, { batchId, pageNumber, full, detail, sha256, width, height, rotationApplied, rotationConfident }): Promise<{ id: number; status: PageStatus; duplicateOfPageId: number | null }>
replacePageImage(db, storage, pageId, { full, detail, sha256, width, height, rotationApplied }): Promise<void>
extractPage(db, storage, ai, pageId, lookups): Promise<{ status: PageStatus; error: string | null }>
getDraft(db, pageId, lookups, today): Promise<{ page: PageInfo; draft: Draft; duplicates: DuplicateRef[] }>
rejectPage(db, pageId, userId, reason?), markPageDuplicate(db, pageId, requisitionId, userId), reopenPage(db, pageId, userId)
listPages(db, { status?, batchId?, limit, offset }), countPagesByStatus(db), nextPageToVerify(db, afterPageId?)
getPageImage(db, storage, pageId, variant: 'full' | 'detail')
```

Rules:

- `addPage`: if another page already has the same `image_sha256`, store the page with status `duplicate` and
  `duplicate_of_page_id` set to the earliest such page; it is not read by the AI until reopened. Otherwise status
  `uploaded`. `rotationConfident` is written to the `page.upload` audit detail and nowhere else. The upload
  progress list shows "check rotation" for such pages at upload time; nothing later depends on it.
- `extractPage`: allowed from `uploaded` or `failed`. Sets `extracting`. AI off: sets `needs_review` with
  `extraction` null. AI on: stores the validated result, model id and time, sets `needs_review`. Any throw:
  `failed` with `extraction_error` (first 500 characters).
- `getDraft`: for `needs_review` pages. With an extraction: `normalizeExtraction`. Without: an empty draft
  (no crew, no lines, request date null). `duplicates` come from `findDuplicates` using the draft's fingerprint
  when crew, PB and date are all present.
- `reopenPage`: from `rejected`, `duplicate` or `failed` back to `uploaded`.
- Queue order everywhere: `batch_id`, then `page_number`.

### requisitions.ts

```ts
saveRequisition(db, input: RequisitionInput, ctx: { userId: number; source: 'scan' | 'manual'; scanPageId?: number }):
  Promise<{ ok: true; id: number; reqNumber: string } | { ok: false; duplicates: DuplicateRef[] }>
updateRequisition(db, id, input: RequisitionInput, userId): Promise<{ ok: true } | { ok: false; duplicates: DuplicateRef[] }>
getRequisition(db, id): Promise<RequisitionDetail | null>          // header, lines, scan page id, audit entries
findDuplicates(db, fingerprint: string, excludeId?: number): Promise<DuplicateRef[]>
verifyRequisition(db, id, userId), voidRequisition(db, id, userId, reason)
markLinesIssued(db, lineIds: number[], issuedOn: string, userId): Promise<{ updated: number; skipped: number }>
```

`saveRequisition`, in one transaction:

1. Validate. `parsePb(pbLocationRaw)` gives `pb_location` and `pb_number`.
2. Compute the fingerprint from the crew code, `pb_location`, `requestDate` and the lines (`partNumber` is the matched part's number, or null).
3. `findDuplicates` (posted requisitions with that fingerprint). If any and `duplicateAcknowledged` is false, return them and write nothing.
4. `req_number = 'MFR-' + nextval('req_number_seq')` zero-padded to six digits.
5. Insert the header with `status 'posted'`, `verified_at = now()`, `verified_by = userId`, `created_by = userId`.
6. Insert lines with `line_no` 1..n in the given order and `qty_issued = issuedQty(sisInitialed, qtyRequested)`.
7. With `scanPageId`: the page must be `needs_review`; set it to `posted` with `requisition_id`.
8. Audit `requisition.create`.

`updateRequisition`: same validation and duplicate check (excluding itself). Replace the header fields, delete
and re-insert the lines, set `updated_at`, keep `req_number`, `source`, `verified_*`. Audit `requisition.update`
with `{ before, after }`. Void requisitions cannot be edited.

`markLinesIssued`: for each line of a posted requisition that is not initialed and has a `qty_requested`: set
`sis_initialed` true, `qty_issued = qty_requested`, `issued_on`. Others count as skipped. Audit one entry per requisition.

`voidRequisition`: admin only (the route checks). Requires a reason. If a scan page points at it, the page stays `posted`.

### tracker.ts

```ts
interface TrackerFilters {
  from?: string; to?: string; crew?: string[]; requesterId?: number; pb?: string; partId?: number[];
  issue?: 'issued' | 'pending'; verified?: boolean; review?: boolean; unresolved?: boolean;
  source?: 'scan' | 'manual' | 'seed'; q?: string; includeVoid?: boolean;
  sort?: 'date_desc' | 'date_asc' | 'pb' | 'part';
}
queryTracker(db, filters, { page, pageSize }): Promise<{ rows: TrackerRow[]; totalLines: number; totalRequisitions: number; sumRequested: number; sumIssued: number }>
exportTracker(db, filters): Promise<TrackerRow[]>       // all rows, no paging
parseTrackerFilters(searchParams): TrackerFilters
```

Reads `v_tracker_lines`. Semantics:

- `pb`: `^\d+-\d+$` is an inclusive range on `pb_number`; `^\d+$` is equality on `pb_number`; other text is a case-insensitive equality on `pb_location`.
- `review`: line or form confidence is not `high`.
- `unresolved`: `part_id is null`.
- `q`: case-insensitive contains on `req_number`, `form_notes`, `line_note`, `part_number_raw`, `part_number`.
- Void requisitions are excluded unless `includeVoid`.
- Default sort `date_desc`: `request_date desc, req_number desc, line_no asc`. `pb`: `pb_number asc nulls last, pb_location, request_date`. `part`: `part_number, request_date`.
- Page size 100.

### matrix.ts

`getMatrix(db, { mode: 'issued' | 'requested', verifiedOnly: boolean })` returns
`{ rows: Array<{ pbLocation, pbNumber }>, columns: Array<{ partId, partNumber, label, crewCode }>, cells: Record<string, { qty: number; requisitionCount: number }>, rowTotals, columnTotals }`
with cell key `${pbLocation}|${partId}`. Rows: numeric PBs ascending, then text locations A to Z. Columns: parts
that have at least one cell, ordered by the first crew (by `sort_order`) that lists them and their order in that
crew, then any other part by number. `verifiedOnly` restricts to verified requisitions (query the base tables with the
same joins as the view rather than the view). Lines with no matched part are left out.

### parts.ts, crews.ts, people.ts

CRUD plus `mergePart(db, fromId, intoId, userId)` in one transaction:

1. Refuse when the ids are equal or `into` is inactive.
2. `requisition_lines.part_id`: `from` becomes `into`.
3. `crew_parts`: for each crew listing `from`, delete the row if the crew already lists `into`, else repoint it.
4. `part_aliases`: repoint aliases of `from`; add the alias `from.part_number` for `into` if that alias is free.
5. `parts` row `from`: `is_active false`, `merged_into_id = into`, `needs_review false`.
6. Audit `part.merge`.

Part numbers and aliases are stored trimmed and uppercased. Crews: saving a crew replaces its ordered part list.

### dashboard.ts

`getDashboard(db)` returns the tile counts:
`pagesToVerify`, `pagesFailed`, `backlogUnverified` (posted, `verified_at` null), `flaggedReads` (unverified requisitions
with any non-high confidence), `linesPending`, `partsToConfirm` (`needs_review` and active), `linesUnresolved`,
`repeatIssues` (matrix cells fed by more than one posted requisition), and `recent` (last ten requisitions).

### export.ts

`toCsv(rows)` and `toXlsx(rows)`. Columns, in this order, with these headers:

`Req #, Request Date, Crew, Requester, PB, Line, Part #, Part Name, Part As Written, Qty As Written, Qty Requested, Qty Issued, Pack Qty, Pack Unit, Date Required, Issue Status, Verified, Confidence, Flags, Notes, Source, Scan Page`

- `Confidence`: the lower of line and form confidence. `Flags`: line and form flags joined with `; `. `Notes`: line note, then form notes, joined with ` | `. `Verified`: `Yes` or `No`. `Scan Page`: the scan page id or blank.
- CSV: RFC 4180, CRLF line ends, UTF-8 with BOM, dates as `YYYY-MM-DD`.
- XLSX: sheet `Tracker`, bold frozen header row, autofilter, real date cells formatted `yyyy-mm-dd`, numeric quantity cells with thousands separators, sensible column widths.
- File names: `mfr-tracker-YYYYMMDD-HHmm.csv` / `.xlsx`, `mfr-matrix-YYYYMMDD-HHmm.xlsx`.

### audit.ts

`audit(db, { userId, action, entity, entityId, detail })`. Actions used: `user.login`, `user.create`, `user.update`,
`page.upload`, `page.reject`, `page.duplicate`, `page.reopen`, `requisition.create`, `requisition.update`,
`requisition.verify`, `requisition.void`, `lines.issue`, `part.create`, `part.update`, `part.merge`, `crew.update`,
`people.update`, `seed.run`.

## 8. HTTP API

Route handlers under `src/app/api`. All return JSON unless noted. All require a session except login.
All mutating routes call `assertSameOrigin`. Errors: `{ error: string, issues?: ... }` with 400 (malformed),
401, 403, 404, 409 (duplicate), 422 (validation), 423 (locked), 500. Every handler exports `runtime = 'nodejs'`.

| Method and path | Body | Success |
|---|---|---|
| POST `/api/auth/login` | `{ email, password }` | 200 `{ user }`, sets cookie |
| POST `/api/auth/logout` | | 204, clears cookie |
| POST `/api/auth/change-password` | `{ currentPassword, newPassword }` | 204 |
| GET `/api/lookups` | | 200 `Lookups` |
| POST `/api/batches` | `{ filename, pageCount }` | 201 `{ id }` |
| POST `/api/batches/[id]/pages` | multipart: `full` (file), `detail` (file, optional), `meta` (JSON string: `pageNumber, sha256, width, height, rotationApplied, rotationConfident`) | 201 `{ id, status, duplicateOfPageId }` |
| POST `/api/pages/[id]/extract` | | 200 `{ status, error }`. Exports `maxDuration = 60`. |
| GET `/api/pages/[id]/image?variant=full\|detail` | | `image/jpeg`, `Cache-Control: private, max-age=3600` |
| PUT `/api/pages/[id]/image` | multipart as for pages | 200 `{ status: 'uploaded' }` |
| GET `/api/pages/[id]/draft` | | 200 `{ page, draft, duplicates }` |
| POST `/api/pages/[id]/reject` | `{ reason? }` | 200 |
| POST `/api/pages/[id]/duplicate` | `{ requisitionId }` | 200 |
| POST `/api/pages/[id]/reopen` | | 200 |
| POST `/api/requisitions` | `{ input, scanPageId? }` | 201 `{ id, reqNumber }`; 409 `{ duplicates }` |
| GET `/api/requisitions/[id]` | | 200 detail |
| PUT `/api/requisitions/[id]` | `{ input }` | 200; 409 `{ duplicates }` |
| POST `/api/requisitions/[id]/verify` | | 200 |
| POST `/api/requisitions/[id]/void` | `{ reason }` | 200, admin |
| POST `/api/lines/mark-issued` | `{ lineIds, issuedOn }` | 200 `{ updated, skipped }` |
| GET `/api/tracker/export?format=csv\|xlsx&...filters` | | file download |
| GET `/api/matrix/export?mode=&verifiedOnly=` | | xlsx download |
| POST `/api/parts`, PUT `/api/parts/[id]` | part fields, `aliases: string[]` | 200/201, admin |
| POST `/api/parts/[id]/merge` | `{ intoId }` | 200, admin |
| POST `/api/crews`, PUT `/api/crews/[id]` | `name, defaultRequesterId, isActive, partIds: number[]` | admin |
| POST `/api/people`, PUT `/api/people/[id]` | `fullName, isRequester, isApprover, isActive` | admin |
| GET `/api/users`, POST `/api/users`, PUT `/api/users/[id]` | `email, fullName, initials, role, password?, isActive?` | admin |

Upload limits enforced by `/pages` routes: `full` up to 2 MB, `detail` up to 1.5 MB, content sniffed as JPEG (starts `FF D8 FF`).

Pages and server components read through services directly; they do not call these routes.

## 9. Seed import rules

`seedDatabase(db, storage, kitDir, admin)` in `services/seed.ts`, called by `scripts/seed.ts`.
`seed/reference_import.mjs` is the runnable reference.

1. If a `scan_batches` row with `source = 'seed'` exists: print "already seeded", change nothing, exit 0.
2. Master data from `seed/master.json`: parts; aliases (uppercased); people (`is_requester` true); crews in file
   order with `sort_order` 0..6, `default_requester_id` by name, `checks` as given; `crew_parts` in listed order.
3. One `scan_batches` row per distinct `scan_file`, `source 'seed'`, `page_count` = its page count.
4. For every page, in file order: upload `seed/pages/{page_key}.jpg` to storage key `seed/{page_key}.jpg`; insert
   `scan_pages` with `page_key`, `image_sha256` (of the file bytes), `width 1600`, `height 1236`, `rotation_applied 0`,
   `extraction_model 'manual-transcription'`, `extraction = { form, lines }` (null for duplicates),
   status `duplicate` when `duplicate_of` is set, else `posted`.
5. For every non-duplicate page, in file order: insert a requisition with the next `req_number`, `source 'seed'`,
   `status 'posted'`, `verified_at` null, crew by `crew_code`, requester by name (null when the seed has null) and
   `requester_name_raw`, `pb_location`, `pb_location_raw`, `pb_number`, `request_date`, `approval_signature_present`,
   `notes`, `flags`, `confidence`, fingerprint per `rules.ts`, `scan_page_id`. Insert its lines: `part_id` by
   `part_number` (null stays null), `qty_requested = qty_each`, `qty_issued = issuedQty(sis_initialed, qty_each)`,
   and the remaining fields by name. Set `scan_pages.requisition_id`.
6. For duplicate pages: `duplicate_of_page_id` = the original page, `requisition_id` = the original's requisition.
7. Admin user from the `admin` argument (see section 3). `app_settings`: `project_label = "Site"`.
8. Audit `seed.run`. Print the counts.

Steps 2 to 8 run in one transaction except the storage uploads, which happen first and are idempotent.

After seeding these must hold (also in `seed/seed_stats.json`):

| Check | Value |
|---|---|
| scan_pages | 148, of which `duplicate` 8 |
| requisitions | 140, numbered MFR-000001 (page A-001) to MFR-000140 (page B-006); A-037 is MFR-000037; B-001 is MFR-000135 |
| requisition_lines | 424; initialed 366; pending 58; no each-count 3; no matched part 1; write-in 10 |
| sum qty_requested / qty_issued | 1,036,394 / 910,895 |
| distinct fingerprints | 140 |
| requisitions with a non-high confidence anywhere | 38 |
| parts with needs_review | 5 |
| matrix cells (issued or requested mode) | 409; fed by more than one requisition 13; PB locations 52; part columns 20 |
| tracker `crew=MIBS` | 108 lines, 27 requisitions, requested 468,104, issued 399,698 |
| tracker `crew=TORQUE_ALIGN` | 192 lines, 35 requisitions, requested 39,207, issued 34,541 |
| tracker `from=2026-10-01&to=2026-10-31` | 185 lines, 63 requisitions, requested 566,892, issued 547,160 |
| tracker `pb=37` | 19 lines, 5 requisitions, requested 24,582 |
| tracker `pb=81-90` | 71 lines, 26 requisitions, requested 292,483, issued 268,535 |
| tracker `issue=pending` | 58 lines, 19 requisitions, requested 125,499, issued 0 |
| part 25050-001 | 29 lines, requested 139,868, issued 119,560 |
| matrix cell PB 37 / 25233-00, issued | 440, requisitionCount 2 |
| after merging 61018-063 into 60819-063 | 60819-063 has 6 lines, issued 140,908; 61018-063 inactive; aliases `61018` and `61018-063` point to 60819-063; PANELS lists 60819-063 in third position |

## 10. Browser scan pipeline

`src/components/scan/`. Runs entirely in the browser.

1. Accept `.pdf`, `.jpg`, `.jpeg`, `.png`, several files at once. Reject batches over 300 pages with a clear message.
2. PDF: load with `pdfjs-dist`; `GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`. `scripts/copy-pdf-worker.mjs`
   copies that file from `node_modules/pdfjs-dist/build/` into `public/` and runs on `postinstall`. Render each
   page to a canvas so its long edge is 2400 px. Load `pdfjs-dist` with a dynamic import inside the client code.
3. Image file: draw onto a canvas, long edge capped at 2400 px.
4. Rotation: draw the canvas down to 440 px wide, take its `ImageData`, call `detectRotation`. Rotate the 2400 px
   canvas clockwise by the returned amount. Keep `confident`.
5. `full`: the upright page scaled to a 1600 px long edge, JPEG quality 0.82. If the blob is over 1.8 MB, re-encode at 0.65.
6. `detail`: the region x 40% to 100%, y 0% to 58% of the upright 2400 px canvas, scaled to 1568 px wide, JPEG quality 0.85.
7. `sha256`: hex digest of the `full` blob bytes (Web Crypto).
8. Upload: `POST /api/batches`, then per page `POST /api/batches/[id]/pages`, then `POST /api/pages/[id]/extract`
   unless the page came back `duplicate`. Three pages in flight at a time. One failed page never stops the batch.
9. Progress per page: rendering, uploading, reading, ready, duplicate, failed (with Retry).
10. Rotate button on the verify screen: fetch `full`, rotate 90° clockwise on a canvas, rebuild `full` and `detail`
    with the same rules (scale `detail` from the 1600 px image), `PUT /api/pages/[id]/image`, then extract again.

`canvas.ts` holds the pure helpers (`rotateCanvas`, `scaleToLongEdge`, `cropRegion`, `toJpegBlob`, `sha256Hex`).

## 11. UI rules

Follow DESIGN.md section 8 for layout and content. In addition:

- Server components for pages and data loading; client components only where there is interaction.
- Tracker and matrix filters live in the URL. The filter bar is a GET form.
- Dates display as `MM/DD/YYYY`; inputs are native `type="date"`. Quantities display with thousands separators.
- Part picker: text input bound to a `datalist` of `partNumber - label`; accepts free text for write-ins.
  On blur, `resolvePart` decides `partId`; unmatched text is kept in `partNumberRaw` with an amber outline.
- Crew select on a new requisition loads that crew's part rows and default requester. Changing crew with
  quantities already typed asks for confirmation.
- "As written" re-parses on input and refills "Each", pack quantity and pack unit, until the user edits "Each" by hand.
- Posting returns 409: show the duplicate banner with links, a "Post anyway" button that resends with
  `duplicateAcknowledged: true`, and "Mark duplicate" (scan pages only).
- After posting from the verify screen go to `nextPageToVerify`; when the queue is empty go to `/inbox` with a toast.
- Unverified requisitions show an amber "Unverified" badge and a "Mark verified" button.
- Empty states say what to do next. Failed states show the error text and a retry.
- Every form control has a label. Tab order follows reading order. Focus is visible.
- No client-side storage (`localStorage`, `sessionStorage`).

## 12. Scripts

| Command | Does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build`, `npm start` | Production build and serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint as scaffolded |
| `npm test` | Vitest, all unit and integration tests |
| `npm run e2e` | Playwright smoke test |
| `npm run verify` | typecheck, lint, test, build, in that order |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` (or the local database) |
| `npm run seed` | Section 9 |
| `npm run user:create -- --email a@b.c --name "Full Name" --role member` | Creates a user, prints a generated temporary password once |
| `npm run preflight` | Reports which adapters are active, checks database and storage round trips, checks `ANTHROPIC_MODEL` exists via the Models API and suggests the newest Sonnet id if it does not |
| `npm run ai:check` | With an API key: reads pages B-001 to B-006 through the live model, compares each line's each-count and initials with `seed/seed.json`, writes `docs/AI_CHECK.md` |
| `npm run go-live` | Requires cloud variables: preflight, migrate, ensure bucket, seed, print the admin login |

## 13. Definition of done

1. `npm run verify` passes from a clean clone after `npm install`.
2. All section 9 checks are covered by tests and pass.
3. `npm run e2e` passes, or DECISIONS.md records why it could not run.
4. In local mode with no environment file: `npm install && npm run seed && npm run dev` gives a working app with 140 requisitions.
5. `docs/HANDOFF.md`, `docs/GO_LIVE.md`, `docs/BUILD_LOG.md` and `README.md` are written.
6. No file under section 1 has changed. No secret is in the repo. `.env.local` and `.data/` are git-ignored.
