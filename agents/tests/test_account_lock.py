import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _account_lock import AccountBusy, account_lock, lock_path, pid_alive  # noqa: E402


def dead_pid() -> int:
    process = subprocess.Popen([sys.executable, "-c", "pass"])
    process.wait()
    return process.pid


def test_pid_alive_distinguishes_live_and_finished_processes():
    assert pid_alive(os.getpid())
    assert not pid_alive(dead_pid())


def test_same_account_is_exclusive_but_other_accounts_run_together(tmp_path):
    with account_lock("kressmer-early", lock_dir=tmp_path):
        with pytest.raises(AccountBusy, match="kressmer-early"):
            with account_lock("kressmer-early", wait_seconds=0, lock_dir=tmp_path):
                pass
        with account_lock("cazador-ofertas", wait_seconds=0, lock_dir=tmp_path):
            assert lock_path("cazador-ofertas", tmp_path).exists()
    assert not lock_path("kressmer-early", tmp_path).exists()


def test_lock_held_by_another_live_process_is_respected(tmp_path):
    path = lock_path("kressmer-early", tmp_path)
    holder = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        path.write_text(json.dumps({"pid": holder.pid}), encoding="utf-8")
        with pytest.raises(AccountBusy):
            with account_lock("kressmer-early", wait_seconds=0, lock_dir=tmp_path):
                pass
        assert json.loads(path.read_text(encoding="utf-8"))["pid"] == holder.pid
    finally:
        holder.kill()
        holder.wait()


def test_lock_of_a_dead_process_is_taken_over(tmp_path):
    path = lock_path("kressmer-early", tmp_path)
    path.write_text(json.dumps({"pid": dead_pid()}), encoding="utf-8")
    with account_lock("kressmer-early", wait_seconds=0, lock_dir=tmp_path):
        assert json.loads(path.read_text(encoding="utf-8"))["pid"] == os.getpid()
    assert not path.exists()
