import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from _config import RUNTIME_PATH
from _log import get_logger

_log = get_logger("browser-cdp")

_RUNTIME_LOCK_PATH = RUNTIME_PATH.with_suffix(".lock")


def _acquire_runtime_lock(timeout: float = 5.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            fd = os.open(str(_RUNTIME_LOCK_PATH), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            return
        except FileExistsError:
            time.sleep(0.05)
    _log.warning("runtime lock timeout, forzando adquisición", lock=str(_RUNTIME_LOCK_PATH))
    _RUNTIME_LOCK_PATH.unlink(missing_ok=True)


def _release_runtime_lock() -> None:
    _RUNTIME_LOCK_PATH.unlink(missing_ok=True)


def load_runtime() -> dict:
    if not RUNTIME_PATH.exists():
        return {}
    return json.loads(RUNTIME_PATH.read_text(encoding="utf-8"))


def save_runtime(data: dict) -> None:
    """Escritura atómica: tmp → os.replace para evitar corrupción en concurrent writes."""
    RUNTIME_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = RUNTIME_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, RUNTIME_PATH)


def runtime_for(account_id: str) -> dict:
    return load_runtime().get(account_id, {})


def save_runtime_for(account_id: str, data: dict) -> None:
    _acquire_runtime_lock()
    try:
        runtime = load_runtime()
        runtime[account_id] = {"saved_at_utc": datetime.now(timezone.utc).isoformat(), **data}
        save_runtime(runtime)
    finally:
        _release_runtime_lock()
