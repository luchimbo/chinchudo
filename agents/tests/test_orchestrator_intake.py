"""Each listening run owns its intake file; leftovers for retry are swept by age."""
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import orchestrator  # noqa: E402


def test_run_intake_is_unique_and_relative(tmp_path, monkeypatch):
    monkeypatch.setattr(orchestrator, "ROOT", tmp_path)
    monkeypatch.setattr(orchestrator, "INTAKE_DIR", tmp_path / "runtime" / "intake")
    first = orchestrator.run_intake("monitor")
    assert first.startswith("runtime/intake/monitor-") and first.endswith(".jsonl")
    assert (tmp_path / "runtime" / "intake").is_dir()


def test_pending_sweep_imports_only_files_between_15_minutes_and_48_hours(tmp_path, monkeypatch):
    intake_dir = tmp_path / "runtime" / "intake"
    intake_dir.mkdir(parents=True)
    shared = tmp_path / "data" / "social-listen-intake.jsonl"
    shared.parent.mkdir(parents=True)
    now = time.time()
    files = {"fresh": now - 60, "pending": now - 3600, "ancient": now - 5 * 86400}
    for name, mtime in files.items():
        path = intake_dir / f"{name}.jsonl"
        path.write_text('{"sourceUrl":"x"}\n', encoding="utf-8")
        os.utime(path, (mtime, mtime))
    (intake_dir / "empty.jsonl").write_text("", encoding="utf-8")
    os.utime(intake_dir / "empty.jsonl", (now - 3600, now - 3600))
    shared.write_text('{"sourceUrl":"legacy"}\n', encoding="utf-8")

    monkeypatch.setattr(orchestrator, "ROOT", tmp_path)
    monkeypatch.setattr(orchestrator, "INTAKE_DIR", intake_dir)
    monkeypatch.setattr(orchestrator, "SHARED_INTAKE", shared)
    calls = []
    monkeypatch.setattr(orchestrator, "run_step", lambda step, command: calls.append(command[-1]) or {"status": "ok"})
    monkeypatch.setattr(orchestrator, "resolve_bin", lambda name: name)

    orchestrator.import_pending_intake([], "monitor")

    assert calls == ["runtime/intake/pending.jsonl", "data/social-listen-intake.jsonl"]
