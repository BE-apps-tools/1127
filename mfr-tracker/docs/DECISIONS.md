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
