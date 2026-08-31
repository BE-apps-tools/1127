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
The **Asset KPIs** page shows every unit on the jobsite with its downtime, cost and
rental position side by side, plus month-by-month trends. It reads the Equipment
Master **plus** these JDE reports:

| Report | What it is | KPIs it drives |
|--------|------------|----------------|
| **Equipment Rates** | one row per unit: charge-out rate, rate group, hourly rate and its cost components | Monthly spend, yearly spend, avg $/hr, maintenance share of the hourly rate, run-rate trend |
| **Anniversary Date** | vendor rental contracts: vendor, PO, rate, billed-through date, contract days | Rental commitment/month, renewals due in 30 days, units past billed-through, off-rent candidates |
| **Equipment Transfer** | the **status event log** — every `Previous → Current` status change with its effective date | Downtime days, breakdowns, fleet availability, avg repair time (MTTR), repeat offenders, who's down right now, downtime-by-month trend |
| *(optional)* utilization / hour meter | the weekly hours or "zero hours" export | Hour meter, idle vs working hours |

Nothing is required: with no reports imported the page still lists the fleet from
the Equipment Master, and each report's columns, tiles and charts appear only once
it lands. A unit is matched on **Unit #**, or on **Serial #** if the report carries
only a serial.

### Refreshing a report
Two paths, same result — importing one report never disturbs the others.

**Browser (no git access needed):**
1. Sign in as admin (**Admin** tab), then open **KPIs** and add `?admin=import` to
   the address (or use the **KPI reports** card on the Admin tab).
2. Drop one or more `.xlsx` reports. Each file's family is detected from its
   **column headers**, so the filename, the column order, and even a report title
   above the header row don't matter. Files are parsed on your device — the
   spreadsheet is never uploaded, only the extracted per-unit values.
3. Check the preview (family, rows/events, units, site, columns matched) →
   **Publish KPI data**. If the **Site** column is flagged, that export is stamped
   with a different jobsite — stop and check you exported the right one.

**Commit to `source/` (automatic):** drop the report `.xlsx` in `source/` alongside
the Equipment Master. The **build-data** Action detects it and rebuilds
`data/kpis.json` on the same run.

> **The repo is public.** Whatever lands in `data/kpis.json` is publicly readable —
> that includes vendor names, PO numbers and rates once those reports are imported.
> Decide that's acceptable (or make the repo private) before importing the rate and
> rental reports.

### How downtime is measured
From the transfer history, not a downtime column — the page rebuilds each unit's
status timeline and adds up the time it spent in a down status:

- **`DN - Down`** (down on site) and **`DS - Down - In Shop`** both count as downtime.
- **`MS - Missing/stolen`** and **`LG - Legal Hold`** are *excluded* rather than
  counted — they are not maintenance problems, so they don't drag availability down.
- Two known quirks of the export are handled so they can't invent downtime: JDE's
  initial-load rows (several same-date "Newly Acquired" rows with no previous
  status, each repeating a later remark) collapse to a single **arrival** marker
  whose status is unknown and counts as neither up nor down; and where a unit
  changed status twice in one day, the day ends in the last state recorded.
- **Avg repair time (MTTR)** is the mean length of *finished* down spans — a unit
  still down doesn't get a repair time until it's back.
- **Fleet availability** is total unit-days not down over total unit-days tracked
  (not an average of per-unit percentages, which would let hundreds of healthy hand
  tools mask a pile driver down for two months).
- **Cost while down** is the unit's charge-out rate × its downtime — what the job
  paid while the unit sat broken.

Click any row for its full **status history**: every change with the date, the
status, how long it lasted, and the remark the crew wrote ("metal in fuel tank",
"DS went to Vermeer"). That's the "why" behind every downtime number.

### Reading the trends
- **Downtime by month** — days down per month, split *on site* vs *in shop*. The
  newest month is to date. Hover for the number of distinct units down.
- **Monthly charge-out run-rate** — the rate report × the units on site, by arrival
  month. It counts only units still on site today, so earlier months exclude units
  that have since left; treat the curve as fleet growth, not accounting history.

### If a report isn't recognised
The importer names the headers it found (the Action logs them under `skipped`).
That usually means the export spells a column differently — send the header row to
whoever maintains the portal; adding the real spelling to
`build/kpi_reports.py` and running `py scripts/sync_kpi_spec.py` teaches **both**
import paths at once.

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
| KPI columns missing on the Asset KPIs page | That report hasn't been imported (the coverage strip at the top says which are in). Import it, or check the **build-data** run for a `skipped` entry naming the file. |
| A KPI report imported but matched few units | The report's Unit #s don't match the Equipment Master's (e.g. it covers another site, or is keyed by serial). The coverage strip counts what matched and flags a report stamped with a different site; "Elsewhere" counts report units not on this jobsite. |
| Downtime looks too high for a unit | Open its row and read the status history. A long span usually means the unit was left in `DN`/`DS` in JDE after it was fixed — the fix is in JDE, and the next export corrects the number. |
| A unit shows no downtime but you know it broke | The transfer report only covers status changes it recorded; a unit with no history shows "—" rather than 0. The coverage strip says how many units have history. |
| Publish KPI data says an error | The Worker needs the `/kpis` route deployed and `GH_TOKEN` with Contents: Read+write — see `worker/SETUP.md` §6. |
| Teams cards stopped arriving (requests still land as Issues) | Only the alert is broken — nothing is lost. Run `wrangler tail` and submit a test request: a `teams webhook …` line gives the status. Usual causes: the Teams workflow was turned off/deleted, or `TEAMS_WEBHOOK_URL` is unset or stale. See `worker/SETUP.md` §7. |
