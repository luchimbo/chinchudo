import json
import sys
from pathlib import Path
import pytest
sys.path.insert(0, str(Path(__file__).parents[1]))
import build_landings as bl


def test_progress_identifies_the_attempt_and_is_not_ordinary_output(monkeypatch, capsys):
    monkeypatch.setenv("BLOG_PREPARATION_ATTEMPT_ID", "current-attempt")
    bl.preparation_progress("REVIEWING")
    line = capsys.readouterr().out.strip()
    assert line.startswith("BLOG_PROGRESS:")
    assert json.loads(line[14:]) == {"attemptId": "current-attempt", "phase": "REVIEWING"}
    monkeypatch.delenv("BLOG_PREPARATION_ATTEMPT_ID")
    bl.preparation_progress("GENERATING")
    assert capsys.readouterr().out == ""


def test_scheduled_save_requires_the_current_active_attempt(monkeypatch):
    sys.path.insert(0, str(Path(__file__).parents[2] / "agents"))
    import db_pg
    monkeypatch.setenv("BLOG_PREPARATION_ATTEMPT_ID", "old-attempt")
    class Connection:
        sql = ""
        args = None
        def execute(self, sql, args):
            self.sql, self.args = sql, args
            return self
        def fetchone(self):
            return None
    connection = Connection()
    with pytest.raises(RuntimeError, match="No hay un día libre"):
        db_pg._attach_scheduled_landing(connection, "client", "article", "2026-11-01")
    assert '"preparation"->>\'attemptId\' = %s' in connection.sql
    assert "IN ('GENERATING', 'REVIEWING')" in connection.sql
    assert connection.args[-1] == "old-attempt"
