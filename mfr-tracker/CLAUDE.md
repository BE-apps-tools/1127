# Standing orders for this repository

You are building MFR Tracker from a finished design. The owner is not available during the build.
Finish the whole plan in one run without asking him anything.

## Read first, in this order

1. `docs/DESIGN.md` - what and why.
2. `docs/BUILD_CONTRACT.md` - binding technical decisions, interfaces, rules, expected numbers.
3. `docs/BUILD_PLAN.md` - the 16 tasks. Execute them in order.
4. `contracts/extraction_prompt.md` and `contracts/extraction.schema.json`.

## Never stop to ask

- Do not ask the owner questions and do not wait for confirmation. There is nobody to answer.
- When something is ambiguous, missing or contradictory: choose the option that best fits `docs/DESIGN.md`,
  write an entry in `docs/DECISIONS.md` (what you hit, what you chose, what you rejected, why), and continue.
- When something is blocked by the environment (a package will not install, a browser will not download,
  no network): use the fallback table below. If the table has no row, pick the smallest workaround that keeps
  the definition of done reachable, log it in DECISIONS.md, and continue.
- Never run a command that waits for keyboard input. Use the non-interactive flag or pipe the answer.
- Order of authority when sources disagree: BUILD_CONTRACT.md, then DESIGN.md, then BUILD_PLAN.md.

## Do not change

- `db/migrations/0001_init.sql`, `src/domain/types.ts`, `src/domain/parse.ts`, `src/domain/rules.ts`,
  `src/domain/orientation.ts`, `tests/domain/parse.test.ts`, `tests/domain/rules.test.ts`,
  `tests/domain/orientation.test.ts`, everything under `contracts/` and `seed/`.
  They are tested against the owner's real forms. If one of them looks wrong, log it in DECISIONS.md and build
  around it; a schema change goes in a new migration file.
- The issue rule, the export column order, the requisition number format, the fingerprint definition.
- Scope. The non-goals in DESIGN.md section 4 stay out. No extra features, pages, settings or dependencies.

## Secrets

- Never open, print, copy or commit `.env.local`. To learn what is configured, run `npm run preflight`.
- Never write a key, password or connection string into code, tests, logs or documents.
- Generated local passwords go only to `${DATA_DIR}/admin-password.txt` and the terminal.

## Working rules

- TDD for services and domain code: test first, watch it fail, implement, watch it pass.
- One commit per task, message `task N: <name>`. Do not push.
- After each task append a line to `docs/BUILD_LOG.md` with the task, result, test counts and commit hash.
- Before saying anything is done, run the command that proves it and read its output.
- Fix the application when a test from the plan fails. Change a test only when it contradicts BUILD_CONTRACT.md,
  and log that.
- TypeScript strict. No `any` except at a third-party boundary with a comment. No `@ts-ignore`.
- SQL is hand-written and parameterised. Never build SQL by joining user input into a string; sort and filter
  options map to fixed fragments.
- Keep files small and single-purpose. Follow the directory layout in contract section 4.
- UI copy is plain and short. Sentence case. No emoji.

## Fallback table

| If this happens | Do this |
|---|---|
| `create-next-app` rejects a flag | Drop that flag, keep `--yes`, rerun. |
| The scaffold layout differs from the plan (for example no `src/`) | Move files so the layout matches contract section 4. |
| `npm run lint` does not exist in this Next.js version | Define `lint` as `eslint .` using the scaffolded config. |
| PGlite fails to load inside the Next.js server | Confirm `serverExternalPackages`; load it with a dynamic `import()` only in PGlite mode; pin the latest PGlite version that works. If it still fails, keep PGlite for Vitest, log it, and mark Task 14 skipped. |
| PGlite option or method names differ from the contract | Use the installed version's API. The conformance test is the judge. |
| `pdfjs-dist` worker will not load | Serve the worker from `public/` as planned; if the file name differs in the installed version, copy the worker file that exists and point `workerSrc` at it. |
| The Anthropic API rejects the JSON schema | Adapt schema syntax to the documented limits, keep field names. If still rejected, use the JSON-in-text path from contract 5.3. |
| `ANTHROPIC_MODEL` is not a valid model id | `npm run preflight` picks the newest model whose id starts with `claude-sonnet`; write that id to DECISIONS.md and use it as the default. |
| No `ANTHROPIC_API_KEY` | Build and test with the mock. Skip `npm run ai:check`. Log it. |
| `npx playwright install chromium` fails | Skip Task 14, log it, continue. |
| A Vitest integration test is slow or flaky on PGlite | Give that file its own fresh database; never share state across files. |
| `exceljs` breaks the build | Keep it in `serverExternalPackages` and import it only inside `export.ts`. |
| A package from the allowed list is deprecated or missing | Use its documented successor, log it. |
| Port 3000 or 3100 is busy | Use the next free port for that run. |

## When finished

Write `docs/HANDOFF.md`, make the final commit, print the path to HANDOFF.md, and stop.
