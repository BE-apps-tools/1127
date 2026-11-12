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
