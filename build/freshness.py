"""Daily freshness check for the Asset-KPI reports (stdlib only).

The three JDE exports are run independently, so any one of them can be forgotten
while the others stay current — leaving the portal presenting a stale number as
fact. This module reads ``data/kpis.json``, works out how long since each report
was last refreshed, and reports what is behind.

Run by ``.github/workflows/kpi-freshness.yml`` once a day. It emails the owner
(SMTP, if configured) and keeps a single GitHub Issue in sync — opened when
something is behind, updated as the situation changes, closed when everything is
current again — so there is a trail without a pile of duplicate issues.

Exit code is 0 even when reports are stale: a stale report is a business fact to
be reported, not a build failure.
"""
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from email.message import EmailMessage

from .kpi_reports import SPEC, STALE_ALERT_DAYS, STALE_WARN_DAYS

ISSUE_TITLE = "Asset KPI reports are out of date"
ISSUE_MARKER = "<!-- kpi-freshness -->"   # finds our own issue without a label


def _today():
    return date.today()


def _age_days(iso, today=None):
    """Whole days since an ISO timestamp. None when unparseable/absent."""
    s = str(iso or "")[:10]
    if not s:
        return None
    try:
        d = date.fromisoformat(s)
    except ValueError:
        return None
    return max(0, ((today or _today()) - d).days)


def assess(bundle, today=None):
    """Per-report freshness, plus the worst level found.

    Returns {"reports": [{kind, label, importedAt, age, level, file}], "level": ...}
    where level is "" (all current), "warn" (a report missed today) or
    "alert" (a report is far enough behind to email about). A family that has
    never been imported is reported as ``missing`` — worth saying once, but it is
    not an alert: the portal is designed to work without every report.
    """
    today = today or _today()
    by_kind = {r.get("kind"): r for r in (bundle.get("reports") or []) if isinstance(r, dict)}
    out, level = [], ""
    for ks in SPEC["kinds"]:
        rep = by_kind.get(ks["kind"])
        if not rep:
            out.append({"kind": ks["kind"], "label": ks["label"], "importedAt": "",
                        "age": None, "level": "missing", "file": ""})
            continue
        age = _age_days(rep.get("importedAt"), today)
        if age is None:
            lvl = "unknown"
        elif age >= STALE_ALERT_DAYS:
            lvl = "alert"
        elif age >= STALE_WARN_DAYS:
            lvl = "warn"
        else:
            lvl = ""
        out.append({"kind": ks["kind"], "label": ks["label"],
                    "importedAt": rep.get("importedAt", ""), "age": age, "level": lvl,
                    "file": rep.get("file", "")})
        if lvl == "alert":
            level = "alert"
        elif lvl in ("warn", "unknown") and level != "alert":
            level = "warn"
    return {"reports": out, "level": level}


def _age_text(age):
    if age is None:
        return "age unknown"
    if age == 0:
        return "refreshed today"
    return "1 day old" if age == 1 else f"{age} days old"


def summary_line(state):
    """One-line summary, for the e-mail subject and the Action log."""
    behind = [r for r in state["reports"] if r["level"] in ("alert", "warn", "unknown")]
    if not behind:
        return "All Asset KPI reports are current"
    worst = max((r["age"] or 0) for r in behind)
    names = ", ".join(r["label"] for r in behind)
    n = len(behind)
    return (f"{n} Asset KPI report{'' if n == 1 else 's'} out of date "
            f"(up to {worst} day{'' if worst == 1 else 's'}): {names}")


def render_body(state, portal_url=""):
    """Markdown body, used for both the e-mail and the GitHub Issue."""
    lines = [ISSUE_MARKER, "", "### Asset KPI report freshness", "",
             "| Report | Last imported | Age | Status |", "|---|---|---|---|"]
    icon = {"": "current", "warn": "**not refreshed today**", "alert": "**OUT OF DATE**",
            "missing": "never imported", "unknown": "age unknown"}
    for r in state["reports"]:
        lines.append("| {} | {} | {} | {} |".format(
            r["label"], (r["importedAt"] or "—")[:10], _age_text(r["age"]), icon[r["level"]]))
    behind = [r for r in state["reports"] if r["level"] in ("alert", "warn")]
    lines += ["", ""]
    if behind:
        lines += ["**What to do:** rerun the export(s) above in JDE and import them —",
                  "either drop the .xlsx in `source/` (the build picks it up), or use",
                  "**KPIs → ?admin=import** in the portal.", ""]
        lines += ["Until then the portal marks those figures with their age, so nobody",
                  "reads them as today's numbers.", ""]
    else:
        lines += ["Every report is current. Nothing to do.", ""]
    if portal_url:
        lines += [f"[Open Asset KPIs]({portal_url})", ""]
    lines += [f"_Thresholds: flagged after {STALE_WARN_DAYS} day(s), "
              f"emailed after {STALE_ALERT_DAYS}. Checked "
              f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%MZ')}._"]
    return "\n".join(lines)


# ---------------------------------------------------------------- e-mail
def send_email(subject, body, env=None):
    """Send the summary by SMTP. Returns a status string; never raises.

    Configured entirely by environment (repo secrets). With MAIL_SERVER unset it
    does nothing and says so — the GitHub Issue is still the durable trail.
    """
    env = env or os.environ
    server = env.get("MAIL_SERVER", "").strip()
    to = env.get("MAIL_TO", "").strip()
    if not server or not to:
        return "skipped (MAIL_SERVER/MAIL_TO not set)"
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = env.get("MAIL_FROM", "").strip() or env.get("MAIL_USERNAME", "").strip() or to
    msg["To"] = to
    msg.set_content(body)
    port = int(env.get("MAIL_PORT", "587") or 587)
    user, pw = env.get("MAIL_USERNAME", ""), env.get("MAIL_PASSWORD", "")
    try:
        if port == 465:
            with smtplib.SMTP_SSL(server, port, context=ssl.create_default_context(), timeout=30) as s:
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(server, port, timeout=30) as s:
                s.starttls(context=ssl.create_default_context())
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        return "sent to " + to
    except Exception as e:                        # never fail the run over an e-mail
        return f"failed: {type(e).__name__}: {str(e)[:200]}"


# ---------------------------------------------------------------- GitHub issue
def _gh(url, token, method="GET", payload=None):
    req = urllib.request.Request(url, method=method,
                                 headers={"Authorization": "Bearer " + token,
                                          "Accept": "application/vnd.github+json",
                                          "User-Agent": "kpi-freshness"})
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data, timeout=30) as r:
        return json.loads(r.read().decode() or "null")


def find_issue(repo, token, fetch=_gh):
    """Our own open freshness issue, found by the marker in its body."""
    url = f"https://api.github.com/repos/{repo}/issues?state=open&per_page=100"
    for it in fetch(url, token) or []:
        if it.get("pull_request"):
            continue
        if ISSUE_MARKER in (it.get("body") or "") or it.get("title") == ISSUE_TITLE:
            return it
    return None


def sync_issue(repo, token, state, body, fetch=_gh):
    """Open / update / close the single freshness issue. Returns what it did."""
    existing = find_issue(repo, token, fetch)
    behind = state["level"] in ("alert", "warn")
    api = f"https://api.github.com/repos/{repo}/issues"
    if behind and not existing:
        fetch(api, token, "POST", {"title": ISSUE_TITLE, "body": body})
        return "opened"
    if behind and existing:
        fetch(f"{api}/{existing['number']}", token, "PATCH", {"body": body})
        return f"updated #{existing['number']}"
    if not behind and existing:
        fetch(f"{api}/{existing['number']}", token, "PATCH",
              {"state": "closed", "state_reason": "completed",
               "body": body + "\n\n_Closed automatically: every report is current again._"})
        return f"closed #{existing['number']}"
    return "nothing to do"


def main():
    path = os.environ.get("KPIS_JSON", "data/kpis.json")
    try:
        with open(path, encoding="utf-8") as f:
            bundle = json.load(f)
    except (OSError, ValueError) as e:
        print(f"cannot read {path}: {e}")
        bundle = {"reports": []}

    state = assess(bundle)
    subject = summary_line(state)
    body = render_body(state, os.environ.get("PORTAL_URL", ""))
    print(subject)
    for r in state["reports"]:
        print(f"  {r['kind']:12} {r['level'] or 'current':12} {_age_text(r['age'])}")

    # E-mail only when something is actually behind — a daily "all good" mail
    # trains people to ignore it.
    if state["level"]:
        print("email:", send_email("[Asset KPIs] " + subject, body))
    else:
        print("email: skipped (nothing is behind)")

    repo, token = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_TOKEN", "")
    if repo and token:
        try:
            print("issue:", sync_issue(repo, token, state, body))
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError) as e:
            print("issue: failed:", type(e).__name__, str(e)[:200])
    else:
        print("issue: skipped (no GITHUB_TOKEN/GITHUB_REPOSITORY)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
