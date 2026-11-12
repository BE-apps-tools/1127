# MFR Tracker

A shared web app for the site inventory team. Crews request hardware on a paper Material Field Requisition (MFR).
The team uploads the scans, an AI model reads them, a person checks each reading against the scan and posts it.
Posted lines feed a searchable tracker and a power block by part matrix, both exportable to Excel.

## Quick start (local mode, no accounts needed)

```bash
npm install
npm run seed
npm run dev
```

`npm run seed` loads the 148-page backlog (140 requisitions, 424 lines) into an embedded database under `.data/` and
prints the admin login once. Open http://localhost:3000 and sign in. Without an `ANTHROPIC_API_KEY` the scan
reading is switched off: uploaded pages open on the verify screen with an empty form to key by hand.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build`, `npm start` | Production build and server |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | Unit and integration tests (Vitest, embedded database) |
| `npm run e2e` | Browser smoke test (Playwright) |
| `npm run verify` | Typecheck, lint, tests and build, in that order |
| `npm run db:migrate` | Apply database migrations |
| `npm run seed` | Load master data, the backlog and the first admin |
| `npm run user:create -- --email a@b.c --name "Full Name" --role member` | Create a user and print a temporary password once |
| `npm run preflight` | Show which adapters are active and check the database, storage and model name |
| `npm run ai:check` | Compare the live model's readings with the transcription on six pages (needs an API key) |
| `npm run go-live` | Cloud setup: bucket, preflight, migrate, seed (needs the cloud variables) |

## Configuration

With no `.env.local` the app runs in local mode. Copy `.env.example` to `.env.local` to change that. The database,
file storage and AI reading are chosen independently from the variables that are set; see
`docs/BUILD_CONTRACT.md` section 3.

## Documents

| File | What it is |
|---|---|
| `docs/DESIGN.md` | What the app does and why |
| `docs/BUILD_CONTRACT.md` | Technical decisions, interfaces, rules and expected numbers |
| `docs/BUILD_PLAN.md` | The 16 build tasks |
| `docs/HANDOFF.md` | What was built, test results, what was skipped, open items |
| `docs/GO_LIVE.md` | Steps to deploy on Supabase and Vercel |
| `docs/DECISIONS.md` | Every judgement call made during the build |
| `docs/BUILD_LOG.md` | One line per task with results and commit |
