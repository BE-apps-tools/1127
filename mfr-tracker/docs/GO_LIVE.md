# Go live: shared deployment on Supabase and Vercel

Do this once the team is ready to use the app together. The local mode used while building keeps everything on one
computer and needs none of this.

## Before you start

- Agree with your project manager or IT that company data may be hosted on Supabase and Vercel, and that scans may be sent to the Anthropic API for reading. Local mode keeps everything on one machine and sends nothing out.
- You need: a Supabase account, a Vercel account, a GitHub account, an Anthropic API key (for scan reading), and Node.js 20.12 or newer on the computer you run the setup from.

## Steps

1. **Create the Supabase project.** In Supabase, create a new project and keep the database password somewhere safe.
2. **Copy three values from Supabase.**
   - The transaction pooler connection string: Connect, then Transaction pooler (port 6543). This is `DATABASE_URL`.
   - The project URL, `https://<project-ref>.supabase.co`. This is `SUPABASE_URL`.
   - A secret key: Settings, API Keys, Secret key (`sb_secret_...`). This is `SUPABASE_SECRET_KEY`. Treat it like a password: it can read and write everything. Never put it in a browser, a chat or a commit.
3. **Generate the session secret.** It signs the sign-in cookies.

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. **Fill `.env.local`.** Copy `.env.example` to `.env.local` and set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` (at least 10 characters). Add `ANTHROPIC_API_KEY` if you want scans read by the model. `.env.local` is git-ignored; do not commit it.
5. **Run the go-live script.**

   ```bash
   npm run go-live
   ```

   It creates the private storage bucket, checks the connections, applies the database schema, loads the 148-page backlog (140 requisitions, 424 lines) and prints the admin login. It stops with a list of what is missing if any variable above is not set. It is safe to run again: a database that is already seeded is left alone.
6. **Push the project to GitHub.** Create a private repository and push this folder to it. Do not push `.env.local`.
7. **Import the repository in Vercel.** Choose the Next.js framework preset and leave the build settings as they are.
8. **Add the environment variables in Vercel.** Add the same variables as in `.env.local`: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SESSION_SECRET`, plus `ANTHROPIC_API_KEY`, and optionally `ANTHROPIC_MODEL` and `STORAGE_BUCKET`. You do not need the `ADMIN_*` values in Vercel.
9. **Deploy.** If the app fails at startup with a message naming a missing variable, add it and redeploy.
10. **Sign in.** Open the deployed address and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You will be asked to choose a new password.
11. **Create the team.** Go to Admin, then Users, and create a login for each person. Each gets a temporary password shown once; they must choose their own at first sign-in.
12. **Check the scan reading.** With `ANTHROPIC_API_KEY` set, run `npm run ai:check` once. It reads six backlog pages through the model and writes `docs/AI_CHECK.md` with how many quantities and initials it got right. Upload a few real scans and compare them on the verify screen before relying on the reading.

## After go-live

- **Verify the backlog.** The 140 backlog requisitions load as posted but unverified. Work through them on the requisition screen (Next unverified) and mark each verified.
- **Confirm the open part questions** listed in `docs/HANDOFF.md`, then merge duplicates in Admin, Parts.
- **Rotate the Supabase secret key.** In Supabase, create a new secret key, update `SUPABASE_SECRET_KEY` in Vercel (and in `.env.local` if you still run scripts from your computer), redeploy, then delete the old key. Do this whenever someone who knew the key leaves, or if it may have been exposed.
- **Rotate the session secret.** Change `SESSION_SECRET` in Vercel and redeploy. Everyone is signed out and signs in again.
- **Back up.** In Supabase, use the dashboard's database backups (scheduled backups are included on paid plans) and download a copy of the `mfr-scans` bucket if you need the page images outside Supabase. The Tracker's Export Excel button is also a quick copy of every requisition line.
- **Never reuse a requisition number.** Requisitions are voided, not deleted, so numbers stay unique. Do not edit the `req_number_seq` sequence by hand.

## Local mode on one computer

```bash
npm install
npm run seed
npm run dev
```

The seed creates the database under `.data/` and prints the admin login once (also saved to `.data/admin-password.txt`).
