"""Guardrails for runtime-only artifacts and legacy SQLite tools."""

from __future__ import annotations

import os

LEGACY_SQLITE_ENTRYPOINTS = {
    "authority_swarm": "src/authority_swarm/cli.py",
    "nurture_legacy": "agents/agente_4_nurture.py",
    "conversion_legacy": "agents/agente_conversion.py",
    "legacy_schema_tools": "scripts/db-apply-diff.mjs",
}


def is_production(env: dict[str, str] | None = None) -> bool:
    values = env if env is not None else os.environ
    return values.get("APP_ENV", "").lower() == "production" or values.get("NODE_ENV", "").lower() == "production"


def sqlite_sandbox_allowed(env: dict[str, str] | None = None) -> bool:
    values = env if env is not None else os.environ
    return values.get("ALLOW_SQLITE_SANDBOX", "").lower() in {"1", "true", "yes"}


def require_sqlite_sandbox(component: str, env: dict[str, str] | None = None) -> None:
    if is_production(env):
        raise RuntimeError(f"{component}: SQLite heredado bloqueado en producción; usá Supabase/Postgres.")
    if not sqlite_sandbox_allowed(env):
        raise RuntimeError(f"{component}: SQLite heredado requiere ALLOW_SQLITE_SANDBOX=1 en desarrollo.")


def healthcheck_errors(env: dict[str, str] | None = None) -> list[str]:
    values = env if env is not None else os.environ
    errors: list[str] = []
    if is_production(values) and sqlite_sandbox_allowed(values):
        errors.append("ALLOW_SQLITE_SANDBOX no puede estar habilitado en producción")
    if is_production(values) and not values.get("DATABASE_URL"):
        errors.append("DATABASE_URL es obligatorio en producción; SQLite no es un fallback válido")
    return errors
