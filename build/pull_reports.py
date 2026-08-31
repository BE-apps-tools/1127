"""Pull the KPI report exports from SharePoint/OneDrive via Microsoft Graph.

This is the step that removes the daily human action: the reports land in one
SharePoint folder (dropped there by a JDE schedule, a Power Automate flow off the
report e-mail, or by hand), and the Action fetches whatever is newest, builds
``data/kpis.json`` and commits only the JSON — the spreadsheets never enter the
repo, which matters because it is public.

Stdlib only, and **inert without configuration**: with no credentials set it
prints why and exits 0, so the workflow can be committed before IT provisions the
app registration without failing every night.

Environment (all from repo secrets):
  GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET   app registration
  GRAPH_DRIVE_ID                                          the document library
  GRAPH_FOLDER_PATH   folder holding the reports (default "KPI Reports")
  KPI_SOURCE_DIR      where to write them (default a temp dir)

The app registration needs application permission **Sites.Selected** plus
read access granted on that one site (or Files.Read.All if your tenant prefers).
"""
import json
import os
import tempfile
import urllib.error
import urllib.parse
import urllib.request

GRAPH = "https://graph.microsoft.com/v1.0"
MAX_BYTES = 40 * 1024 * 1024        # a JDE xlsx is well under this; guard a runaway


def _post_form(url, fields, timeout=30):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def _get(url, token, timeout=60):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token,
                                              "User-Agent": "kpi-pull"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def token_for(tenant, client_id, secret):
    """Client-credentials token for Graph."""
    d = _post_form(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                   {"client_id": client_id, "client_secret": secret,
                    "scope": "https://graph.microsoft.com/.default",
                    "grant_type": "client_credentials"})
    return d["access_token"]


def list_folder(drive_id, folder_path, token, get=_get):
    """The .xlsx files in one folder, newest first."""
    path = urllib.parse.quote(folder_path.strip("/"))
    url = f"{GRAPH}/drives/{drive_id}/root:/{path}:/children?$select=name,size,lastModifiedDateTime,@microsoft.graph.downloadUrl&$top=200"
    items = json.loads(get(url, token).decode()).get("value", [])
    files = [i for i in items
             if i.get("name", "").lower().endswith(".xlsx") and not i["name"].startswith("~$")]
    files.sort(key=lambda i: i.get("lastModifiedDateTime", ""), reverse=True)
    return files


def download(files, out_dir, token, get=_get):
    """Save each file into out_dir. Returns [(name, bytes_written), ...]."""
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    for f in files:
        url = f.get("@microsoft.graph.downloadUrl")
        if not url:
            continue
        if int(f.get("size") or 0) > MAX_BYTES:
            print(f"  skip {f['name']}: {f['size']} bytes is over the size guard")
            continue
        blob = get(url, token)
        dest = os.path.join(out_dir, os.path.basename(f["name"]))
        with open(dest, "wb") as fh:
            fh.write(blob)
        saved.append((f["name"], len(blob)))
        print(f"  pulled {f['name']} ({len(blob):,} bytes, modified {f.get('lastModifiedDateTime','?')})")
    return saved


def main():
    env = os.environ
    need = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_DRIVE_ID"]
    missing = [k for k in need if not env.get(k, "").strip()]
    if missing:
        # Deliberately not an error: the workflow ships before the app
        # registration exists, and a nightly red X trains people to ignore it.
        print("kpi-pull: not configured, nothing to do (missing " + ", ".join(missing) + ")")
        return 0

    folder = env.get("GRAPH_FOLDER_PATH", "KPI Reports")
    out_dir = env.get("KPI_SOURCE_DIR") or tempfile.mkdtemp(prefix="kpi-reports-")
    print(f"kpi-pull: {folder} -> {out_dir}")
    try:
        token = token_for(env["GRAPH_TENANT_ID"], env["GRAPH_CLIENT_ID"], env["GRAPH_CLIENT_SECRET"])
        files = list_folder(env["GRAPH_DRIVE_ID"], folder, token)
        print(f"  {len(files)} xlsx file(s) in the folder")
        saved = download(files, out_dir, token)
    except (urllib.error.HTTPError, urllib.error.URLError, KeyError, ValueError) as e:
        detail = ""
        if isinstance(e, urllib.error.HTTPError):
            try:
                detail = " " + e.read().decode()[:300]
            except Exception:
                pass
        print(f"kpi-pull: FAILED {type(e).__name__}: {str(e)[:200]}{detail}")
        return 1
    if not saved:
        print("kpi-pull: nothing to pull")
        return 0
    print(f"kpi-pull: {len(saved)} file(s) ready in {out_dir}")
    # The workflow reads this to hand the directory to build.build_kpis.
    gh_out = env.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write(f"dir={out_dir}\ncount={len(saved)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
