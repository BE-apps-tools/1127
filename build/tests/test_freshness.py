"""Tests for the daily report-freshness check.

This runs unattended and is the safety net for "I forgot to run a report", so the
level thresholds, the wording and the open/update/close issue behaviour are all
pinned here.
"""
from datetime import date, timedelta

from build import freshness as F
from build.kpi_reports import STALE_ALERT_DAYS, STALE_WARN_DAYS

TODAY = date(2026, 8, 31)


def report(kind, days_old, **extra):
    d = (TODAY - timedelta(days=days_old)).isoformat()
    return {"kind": kind, "label": kind.title(), "importedAt": d + "T06:00:00Z",
            "file": kind + ".xlsx", **extra}


def bundle(*reports):
    return {"builtAt": "", "reports": list(reports), "units": {}}


# ------------------------------------------------------------------ ages
def test_age_days():
    assert F._age_days((TODAY - timedelta(days=3)).isoformat(), TODAY) == 3
    assert F._age_days(TODAY.isoformat() + "T23:59:59Z", TODAY) == 0
    assert F._age_days("", TODAY) is None
    assert F._age_days("not-a-date", TODAY) is None
    # A clock skew shouldn't produce a negative age.
    assert F._age_days((TODAY + timedelta(days=2)).isoformat(), TODAY) == 0


# ------------------------------------------------------------------ levels
def test_everything_current_is_silent():
    st = F.assess(bundle(report("rates", 0), report("rental", 0), report("transfers", 0)), TODAY)
    assert st["level"] == ""
    assert F.summary_line(st) == "All Asset KPI reports are current"


def test_a_report_missed_today_warns():
    st = F.assess(bundle(report("rates", STALE_WARN_DAYS), report("rental", 0),
                         report("transfers", 0)), TODAY)
    assert st["level"] == "warn"
    # The label comes from the spec, not from whatever the stored report said.
    assert "Equipment rates" in F.summary_line(st)
    assert F.summary_line(st).startswith("1 Asset KPI report out of date (up to 1 day)")


def test_a_report_far_behind_alerts():
    st = F.assess(bundle(report("rates", STALE_ALERT_DAYS), report("rental", 0),
                         report("transfers", 0)), TODAY)
    assert st["level"] == "alert"
    rates = next(r for r in st["reports"] if r["kind"] == "rates")
    assert rates["level"] == "alert"


def test_the_worst_report_sets_the_level():
    st = F.assess(bundle(report("rates", 1), report("rental", 9), report("transfers", 0)), TODAY)
    assert st["level"] == "alert", "one alert outranks a warn"
    assert F.summary_line(st).startswith("2 Asset KPI reports out of date (up to 9 days)")


def test_a_never_imported_report_is_reported_but_not_an_alert():
    # The portal is designed to work without every report, so "never imported" is
    # information, not a nightly alarm.
    st = F.assess(bundle(report("rates", 0)), TODAY)
    kinds = {r["kind"]: r["level"] for r in st["reports"]}
    assert kinds["rental"] == "missing" and kinds["transfers"] == "missing"
    assert st["level"] == ""


def test_an_unparseable_timestamp_is_flagged_not_ignored():
    st = F.assess(bundle({"kind": "rates", "label": "Rates", "importedAt": "???"},
                         report("rental", 0), report("transfers", 0)), TODAY)
    assert st["level"] == "warn"
    assert next(r for r in st["reports"] if r["kind"] == "rates")["level"] == "unknown"


def test_every_spec_family_appears_exactly_once():
    # Derived from the spec so that adding a report family doesn't fail this —
    # what matters is that the check reports each family once and misses none.
    from build.kpi_reports import KINDS
    st = F.assess(bundle(), TODAY)
    kinds = [r["kind"] for r in st["reports"]]
    assert len(kinds) == len(set(kinds)), "a family reported twice"
    assert set(kinds) == set(KINDS), "every family the spec knows about must be checked"


# ------------------------------------------------------------------ wording
def test_body_names_the_stale_report_and_what_to_do():
    st = F.assess(bundle(report("rates", 5), report("rental", 0), report("transfers", 0)), TODAY)
    body = F.render_body(st, "https://example.test/kpis.html")
    assert F.ISSUE_MARKER in body, "the marker is how the checker finds its own issue"
    assert "OUT OF DATE" in body
    assert "5 days old" in body
    assert "rerun the export" in body
    assert "https://example.test/kpis.html" in body


def test_body_for_a_clean_run_says_nothing_to_do():
    st = F.assess(bundle(report("rates", 0), report("rental", 0), report("transfers", 0)), TODAY)
    body = F.render_body(st)
    assert "Nothing to do" in body
    assert "OUT OF DATE" not in body


def test_age_text():
    assert F._age_text(0) == "refreshed today"
    assert F._age_text(1) == "1 day old"
    assert F._age_text(4) == "4 days old"
    assert F._age_text(None) == "age unknown"


# ------------------------------------------------------------------ issue sync
class FakeGitHub:
    """Records calls so the open/update/close decision can be asserted."""

    def __init__(self, issues=None):
        self.issues = issues or []
        self.calls = []

    def __call__(self, url, token, method="GET", payload=None):
        self.calls.append((method, url, payload))
        if method == "GET":
            return self.issues
        return {"number": 7}


def test_issue_is_opened_when_a_report_goes_stale():
    gh = FakeGitHub()
    st = F.assess(bundle(report("rates", 5)), TODAY)
    assert F.sync_issue("o/r", "t", st, "body", gh) == "opened"
    assert [c[0] for c in gh.calls] == ["GET", "POST"]
    assert gh.calls[1][2]["title"] == F.ISSUE_TITLE


def test_issue_is_updated_not_duplicated():
    gh = FakeGitHub([{"number": 12, "title": "something else", "body": "x " + F.ISSUE_MARKER}])
    st = F.assess(bundle(report("rates", 5)), TODAY)
    assert F.sync_issue("o/r", "t", st, "body", gh) == "updated #12"
    assert gh.calls[1][0] == "PATCH"
    assert "state" not in (gh.calls[1][2] or {}), "an update must not close it"


def test_issue_is_closed_when_everything_is_current_again():
    gh = FakeGitHub([{"number": 12, "title": F.ISSUE_TITLE, "body": F.ISSUE_MARKER}])
    st = F.assess(bundle(report("rates", 0), report("rental", 0), report("transfers", 0)), TODAY)
    assert F.sync_issue("o/r", "t", st, "body", gh) == "closed #12"
    assert gh.calls[1][2]["state"] == "closed"


def test_no_issue_and_nothing_stale_does_nothing():
    gh = FakeGitHub()
    st = F.assess(bundle(report("rates", 0), report("rental", 0), report("transfers", 0)), TODAY)
    assert F.sync_issue("o/r", "t", st, "body", gh) == "nothing to do"
    assert [c[0] for c in gh.calls] == ["GET"]


def test_pull_requests_are_never_mistaken_for_the_issue():
    gh = FakeGitHub([{"number": 3, "title": F.ISSUE_TITLE, "body": F.ISSUE_MARKER,
                      "pull_request": {"url": "..."}}])
    st = F.assess(bundle(report("rates", 5)), TODAY)
    assert F.sync_issue("o/r", "t", st, "body", gh) == "opened"


# ------------------------------------------------------------------ e-mail
def test_email_is_skipped_when_unconfigured():
    assert "skipped" in F.send_email("s", "b", {})
    assert "skipped" in F.send_email("s", "b", {"MAIL_SERVER": "smtp.test"})   # no MAIL_TO


def test_email_failure_is_reported_not_raised():
    env = {"MAIL_SERVER": "127.0.0.1", "MAIL_PORT": "1", "MAIL_TO": "a@b.test"}
    out = F.send_email("s", "b", env)
    assert out.startswith("failed:"), out
