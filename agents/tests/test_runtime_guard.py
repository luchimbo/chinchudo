"""SQLite must never silently become the production data source."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from runtime_guard import healthcheck_errors, require_sqlite_sandbox


def test_sqlite_requires_explicit_development_opt_in():
    try:
        require_sqlite_sandbox("legacy", {})
        assert False, "SQLite without opt-in should be rejected"
    except RuntimeError as exc:
        assert "ALLOW_SQLITE_SANDBOX" in str(exc)


def test_sqlite_is_blocked_in_production_even_with_opt_in():
    try:
        require_sqlite_sandbox("legacy", {"APP_ENV": "production", "ALLOW_SQLITE_SANDBOX": "1"})
        assert False, "SQLite must be blocked in production"
    except RuntimeError as exc:
        assert "producción" in str(exc)


def test_healthcheck_requires_postgres_in_production():
    errors = healthcheck_errors({"APP_ENV": "production", "ALLOW_SQLITE_SANDBOX": "1"})
    assert any("ALLOW_SQLITE_SANDBOX" in error for error in errors)
    assert any("DATABASE_URL" in error for error in errors)
