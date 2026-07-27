"""Shared OpenAI-compatible LLM transport for Python agents."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path


OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LOCAL_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1"
LOCAL_DEFAULT_MODEL = "qwen2.5:32b"


def load_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def provider() -> str:
    load_env()
    configured = os.getenv("LLM_PROVIDER", "schedule").strip().lower()
    if configured in {"local", "openrouter"}:
        return configured
    return "local" if _local_schedule_active() else "openrouter"


def _parse_time(value: str, fallback: int) -> int:
    match = re.fullmatch(r"(?:[01]?\d|2[0-3]):[0-5]\d", value.strip())
    if not match:
        return fallback
    hours, minutes = map(int, value.split(":"))
    return hours * 60 + minutes


def _local_schedule_active(now: datetime | None = None) -> bool:
    timezone = os.getenv("LLM_SCHEDULE_TIMEZONE", "America/Argentina/Buenos_Aires").strip()
    try:
        current_time = now or datetime.now(ZoneInfo(timezone))
    except Exception:
        current_time = now or datetime.now(ZoneInfo("America/Argentina/Buenos_Aires"))
    current = current_time.hour * 60 + current_time.minute
    start = _parse_time(os.getenv("LLM_LOCAL_START", "09:30"), 9 * 60 + 30)
    end = _parse_time(os.getenv("LLM_LOCAL_END", "17:30"), 17 * 60 + 30)
    return start <= current < end if start <= end else current >= start or current < end


def model(requested: str = "") -> str:
    current_provider = provider()
    if current_provider == "local":
        return os.getenv("LLM_LOCAL_MODEL", "").strip() or os.getenv("LLM_MODEL", LOCAL_DEFAULT_MODEL).strip() or LOCAL_DEFAULT_MODEL
    return requested.strip() or os.getenv("OPENROUTER_MODEL", "").strip() or "google/gemini-2.0-flash-lite"


def config(requested_model: str = "") -> dict[str, str]:
    current_provider = provider()
    if current_provider == "local":
        base_url = os.getenv("LLM_LOCAL_BASE_URL", "").strip() or os.getenv("LLM_BASE_URL", LOCAL_DEFAULT_BASE_URL).strip()
        api_key = os.getenv("LLM_LOCAL_API_KEY", "").strip() or os.getenv("LLM_API_KEY", "ollama").strip() or "ollama"
    else:
        base_url = os.getenv("OPENROUTER_BASE_URL", OPENROUTER_BASE_URL).strip()
        api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(f"Falta API key para el proveedor {current_provider}")
    return {
        "provider": current_provider,
        "base_url": base_url,
        "endpoint": f"{base_url}/chat/completions",
        "model": model(requested_model),
        "api_key": api_key,
    }


def chat(system: str, user: str, requested_model: str = "", temperature: float = 0.3, max_tokens: int | None = None, timeout: int = 120) -> str:
    settings = config(requested_model)
    payload: dict = {
        "model": settings["model"],
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens
    headers = {
        "Authorization": f"Bearer {settings['api_key']}",
        "Content-Type": "application/json",
    }
    if settings["provider"] == "openrouter":
        headers["HTTP-Referer"] = "https://los5apostoles.local/"
        headers["X-Title"] = "Los 5 Apostoles"
    request = urllib.request.Request(
        settings["endpoint"],
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Error {settings['provider']} {exc.code}: {detail}") from exc
    return data["choices"][0]["message"]["content"] or ""


def chat_json(system: str, user: str, requested_model: str = "", temperature: float = 0.3, max_tokens: int | None = None, timeout: int = 120) -> dict:
    text = chat(system, user, requested_model, temperature, max_tokens, timeout).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("La IA no devolvio un objeto JSON")
    return json.loads(text[start : end + 1])
