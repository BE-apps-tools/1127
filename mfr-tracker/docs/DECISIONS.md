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
