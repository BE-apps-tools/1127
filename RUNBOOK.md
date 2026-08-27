# Daily Refresh Runbook — Asset Inventory Portal

Keeping the portal current is a ~2-minute task: **export → trim → commit**. Everything
after the commit is automatic.

---

## Daily (≈2 minutes)

### 1. Export from Oracle JDE
Export the **Equipment Master** from JD Edwards the same way you do today. The file
downloads with a name like `Equipment Master V1.315.xlsx`. Keep a name that starts
with **`Equipment Master`** and ends in **`.xlsx`**. The build uses the **single**
`Equipment Master*.xlsx` file in `source/`, so **the version number does not need to
increase** (and a future `V2.x` is fine). If you ever leave several files, it picks the
highest `V<major>.<minor>`.

### 2. Trim to your site(s)
Open the file in Excel and keep only the rows for your project:
1. Turn on **AutoFilter** (Data → Filter).
2. Filter the **Branch/Plant** column to your site(s) only.
3. Delete the other rows (or copy your rows to a new sheet), then **Save** — keep the
   same `Equipment Master V1.<n>.xlsx` filename.

*Why:* the portal groups assets by Branch/Plant. Trimming keeps the file small and
limits what gets published to just your site. (Reminder: the repo is **public**, so
whatever you commit — including any employee names in the file — is publicly readable.)

### 3. Commit it to the repo
**GitHub web (simplest):**
1. Open the repo → the **`source/`** folder.
2. **Add file → Upload files** → drag in `Equipment Master V1.<n>.xlsx`.
3. **Delete the previous file** in the same commit so only the new one remains in
   `source/` — the build expects a single file, and this avoids piling up daily
   snapshots (with any PII) in the public repo.
4. **Commit changes.**

**Or via git** (if you have a local clone):
```bash
cp "Equipment Master V1.315.xlsx" source/
git add source/ && git commit -m "data: V1.315" && git push
```

That's it. You're done.

---

## What happens automatically (no action needed)
On that commit, the **build-data** GitHub Action:
1. Picks the highest-versioned file in `source/`.
2. Rebuilds the per-site data (normalizes trades, converts dates), **clearing any sites
   no longer in the file**.
3. Commits the refreshed `data/` and republishes the portal (live within ~1–2 min).
4. **Auto-closes** any open *Reassign Trade* request whose asset now matches the
   requested trade (i.e. the reassignment you made in JDE has landed).

---

## Verify (optional, 20 seconds)
- Repo → **Actions** tab: the latest **build-data** run is green.
- Open the portal → the header shows **"Data as of V1.\<n\>"** with today's date.
- Pick your site → confirm the asset count looks right.

---

## Alternative: browser import (no git access needed)
Admins can refresh the inventory straight from the portal instead of committing the
Excel — handy if you'd rather not touch git.

1. Open **Asset Inventory** → click **Admin** in the site bar → enter your name + the
   admin key (the same `ADMIN_KEY` used for delivery trackers).
2. Click **Import Equipment Master** → choose the `Equipment Master*.xlsx`.
   - The file is parsed **entirely in your browser** — the spreadsheet is never
     uploaded; only the built JSON leaves your machine. (Trim to your site(s) first,
     same as step 2 above — the repo is public.)
3. Review the parsed preview (assets per site), then **Publish inventory**.
   The Worker commits the refreshed `data/` to `main`; the portal is live within
   ~1–2 min (same result as the Action-built refresh, minus the file commit).

This path produces byte-identical output to the Action build (it mirrors
`build/build_data.py` + `build/normalize.py`). It does **not** auto-close reassign
requests — that still happens on the next Action-built refresh, or make the JDE fix
and let the daily export handle it.

> **Requires** the Worker's `GH_TOKEN` to have **Contents: Read+write** (the request
> routes only need Issues) and the Worker to be deployed with the `/inventory` route.
> See `worker/SETUP.md` §5.

## Handling change requests (as they come in)
Requests submitted from the portal appear as **GitHub Issues** in the repo:
- **`request:reassign`** — the crew says an asset's trade is wrong. Make the correction
  **in JDE**; the next daily export + build **auto-closes** the issue. No manual close.
- **`request:issue`** — free-text (unit not onsite, wrong description, called off
  inventory, etc.). Act on it, then **close the issue manually** when handled.

GitHub notifies you of new issues (watch the repo / check the **Issues** tab).

---

## Browsing assets (Assets tab)
- **Sort** any column by clicking its header (click again to reverse); an arrow
  shows the active sort.
- **Export CSV** downloads the *currently filtered* asset list (site + search +
  trade + status), parsed on your device — no costs, no upload.
- **Shareable links:** the site, search, trade, status, and sort are kept in the
  page URL, so you can copy the address bar and send someone the exact same view
  (e.g. "all Unassigned at this site").

---

## Asset KPIs (KPIs tab)
The **Asset KPIs** page shows every unit on the jobsite with its utilization, PM
status and cost side by side. It reads the Equipment Master **plus** up to three
report families:

| Family | Typical export | Drives |
|--------|----------------|--------|
| Utilization / hour meter | hour-meter, telematics, idle-vs-working hours | Hour meter, Util %, idle hours, idle-heavy units, hours this period |
| Maintenance / PM / work orders | PM due list, open work orders, downtime | PM due (overdue / due soon), open WOs, down days |
| Cost / rental / fuel | monthly rental or ownership cost, cost to date, fuel | Cost/mo, cost/hr, cost to date, idle cost per month |

Nothing is required: with no reports imported the page still shows the fleet from
the Equipment Master, and each family's columns and tiles appear only once its
report lands. A unit is matched on **Unit #**, or on **Serial #** if the report
carries only a serial.

### Refreshing a report
Two paths, same result — importing one family never disturbs the others.

**Browser (no git access needed):**
1. Sign in as admin (**Admin** tab), then open **KPIs** and add `?admin=import` to
   the address (or use the Import panel link).
2. Drop one or more `.xlsx` reports. Each file's family is detected from its
   **column headers**, so the filename and column order don't matter. Files are
   parsed on your device — the spreadsheet is never uploaded, only the extracted
   per-unit values.
3. Check the preview (family, rows, units, columns matched) → **Publish KPI data**.

**Commit to `source/` (automatic):** drop the report `.xlsx` in `source/` alongside
the Equipment Master. The **build-data** Action detects it and rebuilds
`data/kpis.json` on the same run. (Reminder: the repo is public — trim the report
to your site first, same as the Equipment Master.)

### If a report isn't recognised
The importer names the headers it found (the Action logs them as `skipped`). That
usually means the export spells a column differently — send the header row to
whoever maintains the portal; adding the real spelling to
`build/kpi_reports.py` teaches **both** import paths at once.

### What the numbers mean
`data/kpis.json` stores only what the reports say. The page derives the rest, so
nothing goes stale:
- **Util %** — working ÷ (working + idle) hours; falls back to
  (engine − idle) ÷ engine, or hours ÷ target, depending on what the report carries.
- **Idle-heavy** — utilization at or below **40%**.
- **PM overdue / due soon** — past its due date or due hours; "soon" is within
  **14 days** or **50 hours**.
- **Cost / hr** — the report's rate per hour, else monthly cost ÷ period hours.
- **Idle cost / month** — monthly cost × the non-working share of hours.

Every view is shareable (site, search, filters, sort and page live in the URL) and
**Export CSV** downloads the filtered rows, including the raw report fields.

## Occasional maintenance
- **Rotate the GitHub token before it expires.** When the fine-grained token lapses,
  submits fail with `github 404`. Regenerate it (Issues: Read and write on this repo)
  and update the **`GH_TOKEN`** secret on the Cloudflare Worker (`asset-portal`).
- **If you change the trade list**, edit the `TRADES` array near the top of the script in
  `index.html` and the `CANONICAL`/`_VARIANTS` maps in `build/normalize.py`, then commit.

---

## Troubleshooting
| Symptom | Likely cause / fix |
|---------|--------------------|
| Portal data didn't update | Actions tab — did **build-data** run and pass? If it didn't trigger, the uploaded file wasn't named `Equipment Master V1.<n>.xlsx` or wasn't in `source/`. |
| Action failed: "no Equipment Master…found" | The file isn't in `source/` or the name doesn't match the pattern. |
| Submit says "saved offline" repeatedly | The device really can't reach the Worker (no signal, blocked, or the wrong Worker URL). The requests are held on that device and go out on the next load once it can connect. A Worker that answers but *refuses* now says so instead of claiming offline — see the next two rows. |
| Submit says "submit key was rejected" | The Worker's `SUBMIT_KEY` no longer matches the one in `inventory.html`. Most often it was wiped by a `wrangler deploy`: only `GH_REPO`/`ALLOWED_ORIGIN` live in `wrangler.toml`, so a plain-text `SUBMIT_KEY` set in the dashboard is dropped on deploy. Re-add it in Cloudflare (**Settings → Variables and Secrets**, then click **Deploy**), or `wrangler secret put SUBMIT_KEY` so it survives future deploys. Nothing is lost — nothing was saved. |
| Submit says "server busy" | A 5xx/429 from the Worker (usually `GH_TOKEN` expired or lost Issues:write). Regenerate + update the secret; held requests retry themselves on the next load. |
| A site you removed still shows | Hard-refresh; the build clears stale sites on each run, so it should drop after the next build. |
| KPI columns missing on the Asset KPIs page | That family's report hasn't been imported (the coverage strip at the top says which are in). Import it, or check the **build-data** run for a `skipped` entry naming the file. |
| A KPI report imported but matched few units | The report's Unit #s don't match the Equipment Master's (e.g. it's keyed by serial or by another site's units). The coverage strip counts what matched; "Elsewhere" counts report units not on this site. |
| Publish KPI data says an error | The Worker needs the `/kpis` route deployed and `GH_TOKEN` with Contents: Read+write — see `worker/SETUP.md` §6. |
| Teams cards stopped arriving (requests still land as Issues) | Only the alert is broken — nothing is lost. Run `wrangler tail` and submit a test request: a `teams webhook …` line gives the status. Usual causes: the Teams workflow was turned off/deleted, or `TEAMS_WEBHOOK_URL` is unset or stale. See `worker/SETUP.md` §7. |
