"""Logging JSON estructurado para los agentes. Uso:

    from _log import get_logger
    log = get_logger("publisher")
    log.info("publicando", account="productor", channel="youtube")
    log.warning("reintento", attempt=2, error="no_comment_box")
    log.error("fallo final", error=str(exc))

Cada mensaje va a stderr (visible en los .err de run-scheduled.ps1) y además
emite una línea JSON para indexar en logs/agents.jsonl si LOG_FILE está seteado.
La variable AGENT_CORRELATION_ID (env) se incluye en cada mensaje para trazar
un run completo orchestrator → social-listen → browser-cdp → publisher.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class _JsonLogger:
    def __init__(self, agent: str, log_file: Path | None = None):
        self._agent = agent
        self._cid = os.environ.get("AGENT_CORRELATION_ID", "")
        self._file = log_file
        # También configurar el módulo logging estándar para librerías
        logging.basicConfig(
            level=logging.WARNING,
            format="%(levelname)s %(name)s %(message)s",
            stream=sys.stderr,
        )

    def _emit(self, level: str, msg: str, **kw) -> None:
        record = {
            "ts": _now(),
            "level": level,
            "agent": self._agent,
            "msg": msg,
        }
        if self._cid:
            record["cid"] = self._cid
        if kw:
            record.update(kw)
        line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
        print(line, file=sys.stderr, flush=True)
        if self._file:
            try:
                self._file.parent.mkdir(parents=True, exist_ok=True)
                with self._file.open("a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except OSError:
                pass

    def debug(self, msg: str, **kw) -> None:
        if os.environ.get("AGENT_LOG_DEBUG") == "1":
            self._emit("DEBUG", msg, **kw)

    def info(self, msg: str, **kw) -> None:
        self._emit("INFO", msg, **kw)

    def warning(self, msg: str, **kw) -> None:
        self._emit("WARNING", msg, **kw)

    def error(self, msg: str, **kw) -> None:
        self._emit("ERROR", msg, **kw)


def get_logger(agent: str) -> _JsonLogger:
    """Devuelve un logger JSON para el agente indicado.
    Si LOG_FILE está seteado en el entorno, también escribe a ese archivo."""
    log_file: Path | None = None
    log_file_env = os.environ.get("AGENT_LOG_FILE", "")
    if log_file_env:
        log_file = Path(log_file_env)
    return _JsonLogger(agent, log_file)
