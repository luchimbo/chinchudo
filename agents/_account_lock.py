"""One process per browser profile: concurrent pipelines may run, but never drive the same account."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOCK_DIR = ROOT / "data" / "locks"
# Below the quota's 60s listen timeout, so a busy account is reported, not killed.
DEFAULT_WAIT_SECONDS = float(os.environ.get("ACCOUNT_LOCK_WAIT_SECONDS", "20"))


class AccountBusy(RuntimeError):
    pass


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        # os.kill(pid, 0) on Windows sends CTRL_C_EVENT; query the process instead.
        import ctypes

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() == 5  # access denied => it exists
        try:
            code = ctypes.c_ulong()
            return bool(kernel32.GetExitCodeProcess(handle, ctypes.byref(code))) and code.value == 259  # STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def lock_path(account: str, lock_dir: Path = LOCK_DIR) -> Path:
    return lock_dir / f"browser-{re.sub(r'[^A-Za-z0-9_.-]', '_', account)}.lock"


def _holder(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


@contextmanager
def account_lock(account: str, wait_seconds: float = DEFAULT_WAIT_SECONDS, lock_dir: Path = LOCK_DIR, poll: float = 1.0):
    """Hold the account's profile; a lock whose owner process died is taken over."""
    path = lock_path(account, lock_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + wait_seconds
    while True:
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            holder = _holder(path)
            if not pid_alive(int(holder.get("pid") or 0)):
                # Empty holder may be a lock being written right now: only take it over once it is not fresh.
                if holder or time.time() - path.stat().st_mtime > 5:
                    path.unlink(missing_ok=True)
                    continue
            if time.monotonic() >= deadline:
                raise AccountBusy(f"Cuenta {account} ocupada por otra corrida (pid {holder.get('pid', '?')})")
            time.sleep(poll)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"pid": os.getpid(), "account": account, "started_at": datetime.now(timezone.utc).isoformat()}, handle)
        yield
    finally:
        if _holder(path).get("pid") == os.getpid():
            path.unlink(missing_ok=True)
