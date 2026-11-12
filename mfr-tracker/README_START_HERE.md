# MFR Tracker starter kit - start here

This folder is everything Claude Code needs to build the Material Field Requisition tracker without you.
You launch it once. It works through 16 tasks, tests itself, and leaves a handoff note.

## What is in the kit

| Item | What it is |
|---|---|
| `docs/DESIGN.md` | The design: what the app does and why |
| `docs/BUILD_CONTRACT.md` | Locked technical decisions, interfaces, rules, expected numbers |
| `docs/BUILD_PLAN.md` | The 16 tasks Claude Code executes in order |
| `CLAUDE.md` | Standing orders: never stop to ask, what to do when blocked |
| `db/migrations/0001_init.sql` | Database schema, already run on PostgreSQL with your backlog |
| `src/domain/`, `tests/domain/` | Quantity, date and PB parsing, duplicate detection, auto-rotation. 22 passing tests against every value on your 148 forms |
| `contracts/` | The AI reading prompt and its output format |
| `seed/` | Your 148 pages transcribed (140 requisitions, 424 lines, 8 duplicate scans), the page images, and the expected totals |
| `seed/seed_preview.csv` | The transcription as one flat sheet. Open it in Excel to spot-check. |
| `.claude/settings.json` | Pre-approved commands so Claude Code is not asking permission every minute |

## Before you launch (5 minutes)

- Install Node.js 20.12 or newer, Git, and Claude Code.
- Unzip this folder somewhere you keep code. The folder itself becomes the project.
- Optional but recommended: create a file named `.env.local` in the folder with one line,
  `ANTHROPIC_API_KEY=your-key`. With it, Claude Code tests the scan reading against six of your real pages and
  reports the accuracy. Without it, everything still builds and the reading runs on a stand-in.

You do not need Supabase or Vercel to build. Those come at go-live.

## Launch

```
cd mfr-tracker
claude --permission-mode acceptEdits
```

Accept the prompt to trust the folder, then paste this:

```
Read CLAUDE.md, then docs/DESIGN.md, docs/BUILD_CONTRACT.md and docs/BUILD_PLAN.md in full.
Execute BUILD_PLAN.md from Task 1 through Task 16 in order, in this session, without stopping
and without asking me anything. Follow CLAUDE.md whenever something is unclear or blocked.
When Task 16 is complete, print the path to docs/HANDOFF.md and stop.
```

About permissions:

- `.claude/settings.json` pre-approves npm, npx, node, local git commits and basic file commands, and blocks
  `git push` and reading `.env.local`. Claude Code may still ask about a command outside that list. Choose
  "always allow" when it does and it will not ask again.
- For a run with no prompts at all, launch with `claude --dangerously-skip-permissions` instead. That turns
  every permission check off, so only do it in this folder on a machine you are comfortable with.

If the session ends early (usage limit, closed laptop), open Claude Code in the folder again and paste:

```
Read CLAUDE.md and docs/BUILD_LOG.md, then continue docs/BUILD_PLAN.md from the first task
that BUILD_LOG.md does not record as done. Do not ask me anything.
```

Expect a long session: hours, not minutes.

## When it finishes

- Read `docs/HANDOFF.md` first. It lists what was built, test results and anything skipped.
- Read `docs/DECISIONS.md`. Every judgment call made without you is there.
- Try it on your machine:

```
npm run seed
npm run dev
```

  Open http://localhost:3000 and sign in as `admin@local.test`. The password is in `.data/admin-password.txt`.
  You should see 140 requisitions, 58 lines pending issue and 38 flagged reads.

## Going live for your team

`docs/GO_LIVE.md` (written during the build) has the exact steps. In short:

- Create a Supabase project and copy three values into `.env.local`: the transaction pooler connection string,
  the project URL and a secret key.
- Add a session secret and your admin email, name and password to `.env.local`.
- Run `npm run go-live`. It creates the tables, the storage bucket, loads the backlog and your admin login.
- Push the repo to GitHub, import it in Vercel, add the same variables there, deploy.
- Create logins for your team in Admin > Users.

## Before your team relies on it

- Get your PM or IT to agree to the hosting. Site material data will sit on Supabase and Vercel, and scans go to
  the Anthropic API to be read. Local mode keeps everything on one machine if they say no.
- Settle the three part questions in Admin > Parts: 61018-063 vs 60819-063, 25233-00 vs 25233-001, and the box
  size of 465 for 60825-300.
- Work the backlog: Tracker > Flagged first (38 requisitions), then the rest. Each one opens beside its scan;
  correct it and press Mark verified.
- The transcription of your backlog is a careful hand reading, not ground truth. Treat every backlog number as
  unverified until someone has checked it against the scan.
