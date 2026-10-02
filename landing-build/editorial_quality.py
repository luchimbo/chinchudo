"""Puente al control editorial compartido con Next.js y el relay Node."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def quality_bridge(command: str, **data) -> dict:
    process = subprocess.run(
        [os.environ.get("NODE_BIN", "node"), str(ROOT / "scripts" / "blog-quality-check.mjs")],
        input=json.dumps({"command": command, **data}, ensure_ascii=False),
        text=True, encoding="utf-8", capture_output=True, timeout=20,
    )
    if process.returncode:
        raise RuntimeError(f"Falló el control editorial: {process.stderr[-500:]}")
    return json.loads(process.stdout)


def intent_for_date(day: str) -> str:
    from datetime import date
    return "educational" if (date.fromisoformat(day) - date(1970, 1, 1)).days % 2 == 0 else "decision"
