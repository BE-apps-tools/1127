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
  repeat offenders) and an optional **utilization / hour-meter** export. Reports
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
| `kpis.html` | Asset KPIs (unit KPIs by jobsite) + browser KPI-report importer |
| `guide.html` | Interactive in-app guide (Admin + End-user tracks) |
| `data/` | Generated per-site JSON + `sites.json` index + `meta.json` + `kpis.json` |
| `build/` | Python xlsx→JSON build + tests (stdlib only) |
| `build/kpi_reports.py` | KPI report adapters (header aliases per report family) |
| `.github/workflows/build-data.yml` | Daily build + reconcile Action |
| `worker/` | Cloudflare Worker (request submit + open-requests read) |
| `scripts/brandcheck.py` | Blattner brand gate for `index.html` |
| `scripts/sync_kpi_spec.py` | Mirrors the KPI report spec into `kpis.html` |

## Adding a KPI report

Drop the `.xlsx` in `source/` (the Action picks it up) or import it from
**KPIs → `?admin=import`** — either path writes the same `data/kpis.json`.
If a report isn't recognised, the build/importer says which headers it found;
add the real header to the right alias list in `build/kpi_reports.py`, run
`py scripts/sync_kpi_spec.py`, and both paths pick it up. `data/kpis.json`
stores raw report facts only — utilization %, PM overdue, cost/hour and idle
cost are derived in `kpis.html`, so there is one definition of each metric.

## Setup

- Portal + data pipeline: see [`DEPLOY-portal.md`](DEPLOY-portal.md).
- Change-request Worker: see [`worker/SETUP.md`](worker/SETUP.md).

Design and implementation notes live under `docs/superpowers/` in the source
project.
