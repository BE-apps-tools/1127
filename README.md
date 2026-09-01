# Asset Inventory Portal

A shared, GitHub-backed inventory portal for reviewing the Blattner Equipment
Master (scoped by job site) and submitting **Reassign Trade** / **Report Issue**
change requests — which become auto-reconciling GitHub Issues.

## How it works

- **Data source:** the daily Oracle JDE export `Equipment Master V1.<n>.xlsx` is
  committed to `source/`. A GitHub Action (`.github/workflows/build-data.yml`)
  builds slim, per-site JSON into `data/` (normalizing trades, converting dates)
  and commits it back.
- **Portal (`index.html`):** a static, Blattner-branded single-page app served by
  GitHub Pages. Pick a site, search by Unit # or Serial #, review assets, and
  submit change requests.
- **Asset KPIs (`kpis.html`):** unit-level detail and equipment trends for a
  jobsite, joining the Equipment Master with four JDE report families:
  **Equipment Rates** (monthly/yearly spend, $/hr, maintenance share),
  **Anniversary Date** (vendor rental commitment, renewals, off-rent candidates),
  **Equipment Transfer** (a status event log → downtime, MTTR, availability,
  repeat offenders), **Damage Expenses** (a cost ledger → damage spend, incidents,
  damage as a share of a unit's yearly cost) and an optional
  **Equipment hours** export. Reports
  are recognised by their **column headers** (not filenames, and the header row
  need not be row 1), and each family's columns, tiles and trend charts appear
  only once that report is imported.
- **Requests:** a small Cloudflare Worker (`worker/`) turns UI submissions into
  GitHub Issues (no GitHub account needed for submitters). Satisfied
  reassignments auto-close on the next build.

## Layout

| Path | Purpose |
|------|---------|
| `index.html` | The portal SPA |
| `kpis.html` | Asset KPIs (unit KPIs by jobsite) — read-only view |
| `kpi-core.js` | Browser KPI import engine (spec, coercion, xlsx, extract, merge) shared by `admin.html` and `kpis.html` |
| `admin.html` | Admin tools, including the **KPI builder** (drop the reports, preview, publish) |
| `guide.html` | Interactive in-app guide (Admin + End-user tracks) |
| `data/` | Generated per-site JSON + `sites.json` index + `meta.json` + `kpis.json` |
| `build/` | Python xlsx→JSON build + tests (stdlib only) |
| `build/kpi_reports.py` | KPI report adapters (header aliases per report family) |
| `.github/workflows/build-data.yml` | Daily build + reconcile Action |
| `.github/workflows/kpi-pull.yml` | Daily unattended pull of the KPI reports (SharePoint → Graph → `data/kpis.json`) |
| `.github/workflows/kpi-freshness.yml` | Daily check that no report has gone stale (e-mail + one auto-closing Issue) |
| `build/freshness.py` | The freshness assessment + alerting |
| `build/pull_reports.py` | Microsoft Graph pull of the report exports |
| `worker/` | Cloudflare Worker (request submit + open-requests read) |
| `scripts/brandcheck.py` | Blattner brand gate for `index.html` |
| `scripts/sync_kpi_spec.py` | Mirrors the KPI report spec into `kpi-core.js` |

## Keeping the reports current

The three exports are run independently, so a missed one would leave a stale
figure looking current. Each report is stamped with when it was imported; the page
flags anything not refreshed today (banner, coverage strip, and the tiles that
report feeds), and **`kpi-freshness`** checks daily, e-mailing and keeping one
auto-closing Issue. **`kpi-pull`** removes the manual step altogether once the
Graph secrets are set — it is inert until then. Setup and the JDE/Power Automate
asks are in [`RUNBOOK.md`](RUNBOOK.md#automating-the-reports-so-a-forgotten-run-cant-dirty-the-data).

## Adding a KPI report

Drop the `.xlsx` in `source/` (the Action picks it up) or drop it into the
**KPI builder** on the Admin page — either path writes the same `data/kpis.json`.
If a report isn't recognised, the build/builder says which headers it found;
add the real header to the right alias list in `build/kpi_reports.py`, run
`py scripts/sync_kpi_spec.py`, and both paths pick it up (the browser half lives
in `kpi-core.js`). `data/kpis.json` stores raw report facts only — downtime,
availability, MTTR, cost/hour and damage share are derived in `kpis.html`, so
there is one definition of each metric.

## Setup

- Portal + data pipeline: see [`DEPLOY-portal.md`](DEPLOY-portal.md).
- Change-request Worker: see [`worker/SETUP.md`](worker/SETUP.md).

Design and implementation notes live under `docs/superpowers/` in the source
project.
