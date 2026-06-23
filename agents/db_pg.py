"""
Acceso a Postgres desde los agentes Python del suite pcmidi.
Usa psycopg3 con la misma DATABASE_URL que Prisma.
"""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Generator

import psycopg
from psycopg.rows import dict_row

_DATABASE_URL: str | None = None


def _get_url() -> str:
    global _DATABASE_URL
    if _DATABASE_URL is None:
        from dotenv import load_dotenv
        load_dotenv()
        url = os.getenv("DIRECT_URL") or os.getenv("DATABASE_URL")
        if not url:
            raise RuntimeError("DATABASE_URL / DIRECT_URL no está configurada en el entorno.")
        # psycopg3 usa postgresql://, no postgres://
        url = url.replace("postgres://", "postgresql://", 1)
        # psycopg3 no soporta pgbouncer=true como parámetro
        if "pgbouncer=" in url:
            import urllib.parse
            parsed = urllib.parse.urlparse(url)
            query_params = urllib.parse.parse_qsl(parsed.query)
            filtered_params = [p for p in query_params if p[0] != "pgbouncer"]
            new_query = urllib.parse.urlencode(filtered_params)
            parsed = parsed._replace(query=new_query)
            url = urllib.parse.urlunparse(parsed)
        _DATABASE_URL = url
    return _DATABASE_URL


@contextmanager
def connect() -> Generator[psycopg.Connection, None, None]:
    with psycopg.connect(_get_url(), row_factory=dict_row) as conn:
        yield conn


# ─── Landings ────────────────────────────────────────────────────────────────

def upsert_landing(slug: str, keyword: str, html_content: str, **kwargs) -> str:
    """Inserta o actualiza una landing. Devuelve el id."""
    fields = {"slug": slug, "keyword": keyword, "htmlContent": html_content, **kwargs}
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    update = ", ".join(f'"{k}" = EXCLUDED."{k}"' for k in fields if k != "slug")
    sql = f"""
        INSERT INTO "Landing" ({cols})
        VALUES ({vals})
        ON CONFLICT (slug) DO UPDATE SET {update}, "updatedAt" = NOW()
        RETURNING id
    """
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def list_landings(status: str = "DRAFT", limit: int = 20) -> list[dict]:
    with connect() as conn:
        return conn.execute(
            'SELECT * FROM "Landing" WHERE status = %s ORDER BY "createdAt" DESC LIMIT %s',
            (status, limit),
        ).fetchall()  # type: ignore[return-value]


def update_landing_status(landing_id: str, status: str) -> None:
    with connect() as conn:
        conn.execute(
            'UPDATE "Landing" SET status = %s, "updatedAt" = NOW() WHERE id = %s',
            (status, landing_id),
        )


# ─── Leads ───────────────────────────────────────────────────────────────────

def insert_lead(email: str, nombre: str, slug: str, **kwargs) -> str:
    fields = {"email": email, "nombre": nombre, "slug": slug, **kwargs}
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    sql = f'INSERT INTO "Lead" ({cols}) VALUES ({vals}) RETURNING id'
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def list_leads_pending_nurture(step_day: int = 0, limit: int = 50) -> list[dict]:
    """Leads que aún no tienen el paso de nurturing del día dado."""
    with connect() as conn:
        return conn.execute(
            """
            SELECT l.* FROM "Lead" l
            WHERE NOT EXISTS (
                SELECT 1 FROM "NurtureStep" ns
                WHERE ns."leadId" = l.id AND ns."stepDay" = %s
            )
            ORDER BY l."createdAt" ASC LIMIT %s
            """,
            (step_day, limit),
        ).fetchall()  # type: ignore[return-value]


# ─── Nurture steps ───────────────────────────────────────────────────────────

def insert_nurture_step(lead_id: str, step_day: int, scheduled_at: Any, **kwargs) -> str:
    fields = {"leadId": lead_id, "stepDay": step_day, "scheduledAt": scheduled_at, **kwargs}
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    sql = f'INSERT INTO "NurtureStep" ({cols}) VALUES ({vals}) RETURNING id'
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def mark_nurture_step_sent(step_id: str) -> None:
    with connect() as conn:
        conn.execute(
            'UPDATE "NurtureStep" SET status = \'SENT\', "sentAt" = NOW() WHERE id = %s',
            (step_id,),
        )


def list_pending_nurture_steps(limit: int = 50) -> list[dict]:
    with connect() as conn:
        return conn.execute(
            """
            SELECT ns.*, l.email, l.nombre, l.slug, l.keyword
            FROM "NurtureStep" ns
            JOIN "Lead" l ON l.id = ns."leadId"
            WHERE ns.status = 'PENDING' AND ns."scheduledAt" <= NOW()
            ORDER BY ns."scheduledAt" ASC LIMIT %s
            """,
            (limit,),
        ).fetchall()  # type: ignore[return-value]


# ─── Distribution ─────────────────────────────────────────────────────────────

def insert_distribution_piece(canal: str, contenido: str, **kwargs) -> str:
    fields = {"canal": canal, "contenido": contenido, **kwargs}
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    sql = f'INSERT INTO "DistributionPiece" ({cols}) VALUES ({vals}) RETURNING id'
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def list_distribution_pieces(status: str = "NEW", limit: int = 20) -> list[dict]:
    with connect() as conn:
        return conn.execute(
            'SELECT * FROM "DistributionPiece" WHERE status = %s ORDER BY "createdAt" DESC LIMIT %s',
            (status, limit),
        ).fetchall()  # type: ignore[return-value]


def update_distribution_status(piece_id: str, status: str, **kwargs) -> None:
    updates = ', '.join(f'"{k}" = %({k})s' for k in kwargs)
    if updates:
        updates = ", " + updates
    with connect() as conn:
        conn.execute(
            f'UPDATE "DistributionPiece" SET status = %(status)s{updates}, "updatedAt" = NOW() WHERE id = %(id)s',
            {"status": status, "id": piece_id, **kwargs},
        )


# ─── GEO Audits ───────────────────────────────────────────────────────────────

def insert_geo_audit(prompt: str, modelo_ia: str, score: int, **kwargs) -> str:
    competidores = json.dumps(kwargs.pop("competidores", []))
    gaps = json.dumps(kwargs.pop("gapsSugeridos", []))
    fields = {
        "prompt": prompt,
        "modeloIA": modelo_ia,
        "score": score,
        "competidores": competidores,
        "gapsSugeridos": gaps,
        **kwargs,
    }
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    sql = f'INSERT INTO "GeoAudit" ({cols}) VALUES ({vals}) RETURNING id'
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def list_recent_geo_audits(limit: int = 20) -> list[dict]:
    with connect() as conn:
        return conn.execute(
            'SELECT * FROM "GeoAudit" ORDER BY "createdAt" DESC LIMIT %s',
            (limit,),
        ).fetchall()  # type: ignore[return-value]


# ─── Tracking events ──────────────────────────────────────────────────────────

def insert_tracking_event(event_type: str, slug: str, **kwargs) -> str:
    meta = json.dumps(kwargs.pop("meta", {}))
    fields = {"eventType": event_type, "slug": slug, "meta": meta, **kwargs}
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    sql = f'INSERT INTO "TrackingEvent" ({cols}) VALUES ({vals}) RETURNING id'
    with connect() as conn:
        row = conn.execute(sql, fields).fetchone()
    return row["id"]  # type: ignore[index]


def stats_by_slug(slug: str) -> dict:
    with connect() as conn:
        rows = conn.execute(
            '''
            SELECT "eventType", COUNT(*) as total
            FROM "TrackingEvent"
            WHERE slug = %s
            GROUP BY "eventType"
            ''',
            (slug,),
        ).fetchall()
    return {r["eventType"]: r["total"] for r in rows}  # type: ignore[index]
