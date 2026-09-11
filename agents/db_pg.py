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


# ─── Configuración por cliente ────────────────────────────────────────────────
#
# Helpers para Pipeline B (landings, leads, nurturing, distribución, GEO)
#

def get_client_config(client_slug: str) -> dict:
    """
    Devuelve la config completa de un cliente (branding, SMTP, GEO patterns, etc.).
    Lanza RuntimeError si el slug no existe.
    """
    with connect() as conn:
        row = conn.execute(
            """SELECT id, name, slug, "storeUrl", "blogBaseUrl", "labName", "logoUrl",
                      "landingTemplate", "landingPrimaryColor", "landingSecondaryColor",
                      "fromName", "fromEmail", "smtpHost", "smtpPort", "smtpUser", "smtpPass",
                      "unsubscribeBaseUrl", "trackBaseUrl", "geoBrandPatterns",
                      "openrouterApiKey", "openrouterModel", "autoPublish", "autoApprove"
               FROM "Client" WHERE slug = %s""",
            (client_slug,),
        ).fetchone()
    if not row:
        raise RuntimeError(f"Cliente '{client_slug}' no encontrado en DB.")
    return dict(row)


def load_landing_catalog(client_slug: str) -> tuple[dict, dict]:
    """
    Devuelve (categories, products) de la DB para el cliente dado.
    categories: {key: {"id": key, "nombre": name, "url": url, "descripcion": description, "keywords": [...]}}
    products:   {externalId: {"id": externalId, "nombre": name, "marca": brand, "modelo": model,
                              "categoria_id": categoryKey, "url": url, "uso": useText}}
    """
    with connect() as conn:
        client_row = conn.execute('SELECT id FROM "Client" WHERE slug = %s', (client_slug,)).fetchone()
        if not client_row:
            raise RuntimeError(f"Cliente '{client_slug}' no encontrado en DB.")
        client_id = client_row["id"]

        cat_rows = conn.execute(
            'SELECT key, name, url, description, keywords FROM "LandingCategory" WHERE "clientId" = %s',
            (client_id,),
        ).fetchall()
        prod_rows = conn.execute(
            'SELECT "externalId", name, brand, model, "categoryKey", url, "useText" FROM "LandingProduct" WHERE "clientId" = %s',
            (client_id,),
        ).fetchall()

    categories = {}
    for r in cat_rows:
        kws = r["keywords"] if isinstance(r["keywords"], list) else json.loads(r["keywords"] or "[]")
        categories[r["key"]] = {
            "id": r["key"],
            "nombre": r["name"],
            "url": r["url"],
            "descripcion": r["description"],
            "keywords": kws,
        }

    products = {}
    for r in prod_rows:
        products[r["externalId"]] = {
            "id": r["externalId"],
            "nombre": r["name"],
            "marca": r["brand"],
            "modelo": r["model"],
            "categoria_id": r["categoryKey"],
            "url": r["url"],
            "uso": r["useText"],
        }

    return categories, products


def load_seed_topics(client_slug: str) -> list[dict]:
    """
    Devuelve la lista de temas semilla para el cliente desde la DB.
    Formato compatible con el CSV: [{keyword, intencion, categorias_sugeridas}, ...]
    """
    with connect() as conn:
        client_row = conn.execute('SELECT id FROM "Client" WHERE slug = %s', (client_slug,)).fetchone()
        if not client_row:
            raise RuntimeError(f"Cliente '{client_slug}' no encontrado en DB.")
        rows = conn.execute(
            'SELECT keyword, intent, "suggestedCategories" FROM "SeedTopic" WHERE "clientId" = %s ORDER BY "createdAt"',
            (client_row["id"],),
        ).fetchall()

    result = []
    for r in rows:
        cats = r["suggestedCategories"] if isinstance(r["suggestedCategories"], list) else json.loads(r["suggestedCategories"] or "[]")
        result.append({
            "keyword": r["keyword"],
            "intencion": r["intent"],
            "categorias_sugeridas": ";".join(cats),
            "source": "internal",
        })
    return result




def get_client_openrouter(
    client_id: str | None = None,
    client_slug: str | None = None,
) -> tuple[str, str]:
    """
    Devuelve (api_key, model) de OpenRouter para un cliente.
    Prioridad: valor configurado en el Client → variable de entorno → "".
    Si no se pasa cliente (o no se encuentra), cae directo al entorno global.
    """
    env_key = os.getenv("OPENROUTER_API_KEY", "")
    env_model = os.getenv("OPENROUTER_MODEL", "")
    if not client_id and not client_slug:
        return env_key, env_model
    try:
        with connect() as conn:
            if client_id:
                row = conn.execute(
                    'SELECT "openrouterApiKey", "openrouterModel" FROM "Client" WHERE id = %s',
                    (client_id,),
                ).fetchone()
            else:
                row = conn.execute(
                    'SELECT "openrouterApiKey", "openrouterModel" FROM "Client" WHERE slug = %s',
                    (client_slug,),
                ).fetchone()
    except Exception:
        row = None
    if not row:
        return env_key, env_model
    return (row["openrouterApiKey"] or env_key), (row["openrouterModel"] or env_model)


def inject_openrouter_env(client_id: str | None = None, client_slug: str | None = None) -> tuple[str, str]:
    """
    Resuelve la key/modelo de OpenRouter del cliente y los inyecta en os.environ
    para esta corrida, de modo que todo el código que lee os.environ los tome.
    Sin cliente (o sin valores configurados) deja el entorno como está.
    """
    key, model = get_client_openrouter(client_id=client_id, client_slug=client_slug)
    if key:
        os.environ["OPENROUTER_API_KEY"] = key
    if model:
        os.environ["OPENROUTER_MODEL"] = model
    return key, model


# ─── Landings ────────────────────────────────────────────────────────────────

def generate_cuid() -> str:
    import random
    import string
    chars = string.ascii_lowercase + string.digits
    return "c" + "".join(random.choices(chars, k=24))


def upsert_landing(slug: str, keyword: str, html_content: str, **kwargs) -> str:
    """Inserta o actualiza una landing. Devuelve el id."""
    import datetime
    fields = {"slug": slug, "keyword": keyword, "htmlContent": html_content, **kwargs}
    if not fields.get("clientId"):
        raise ValueError("Landing clientId is required")
    if "id" not in fields:
        fields["id"] = generate_cuid()
    if "updatedAt" not in fields:
        fields["updatedAt"] = datetime.datetime.now()
    cols = ", ".join(f'"{k}"' for k in fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    update = ", ".join(f'"{k}" = EXCLUDED."{k}"' for k in fields if k != "slug" and k != "id" and k != "updatedAt")
    sql = f"""
        INSERT INTO "Landing" ({cols})
        VALUES ({vals})
        ON CONFLICT ("clientId", slug) DO UPDATE SET {update}, "updatedAt" = NOW()
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


# ─── Blog editorial / enlaces internos ──────────────────────────────────────

def list_content_clusters(client_slug: str) -> list[dict]:
    with connect() as conn:
        return [dict(row) for row in conn.execute(
            '''SELECT cc.*, p.slug AS "pillarSlug"
               FROM "ContentCluster" cc
               JOIN "Client" c ON c.id = cc."clientId"
               LEFT JOIN "Landing" p ON p.id = cc."pillarLandingId"
               WHERE c.slug = %s
               ORDER BY cc.name''',
            (client_slug,),
        ).fetchall()]


def get_content_cluster(client_id: str, slug: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            'SELECT * FROM "ContentCluster" WHERE "clientId" = %s AND slug = %s',
            (client_id, slug),
        ).fetchone()
    return dict(row) if row else None


def count_editorial_publications_this_week(client_id: str) -> int:
    with connect() as conn:
        row = conn.execute(
            '''SELECT COUNT(*) AS total FROM "Landing"
               WHERE "clientId" = %s
                 AND status = 'PUBLISHED'
                 AND "contentType" IN ('PILLAR', 'GUIDE')
                 AND "publishedAt" >= date_trunc('week', NOW())''',
            (client_id,),
        ).fetchone()
    return int(row["total"] if row else 0)


def rebuild_editorial_internal_links(client_id: str) -> dict:
    """Recalcula enlaces AUTO sin tocar las decisiones PINNED/EXCLUDED.

    Las reglas viven en editorial_graph (puro y testeado); acá sólo se leen
    los artículos publicados e indexables de este cliente y se persiste el plan
    en una única transacción, así nunca queda un grafo a medio escribir.
    """
    try:
        from editorial_graph import Article, pillar_by_cluster, plan_internal_links
    except ImportError:  # importado como paquete (agents.db_pg)
        from agents.editorial_graph import Article, pillar_by_cluster, plan_internal_links

    with connect() as conn:
        rows = conn.execute(
            '''SELECT l.id, l.slug, l.intent, l.titulo, l."seoTitle", l.keyword,
                      l."htmlContent", l."contentType", l."contentClusterId", l."publishedAt"
               FROM "Landing" l
               WHERE l."clientId" = %s
                 AND l.status = 'PUBLISHED'
                 AND l."indexingState" = 'INDEX'
                 AND l."contentType" IN ('PILLAR', 'GUIDE')''',
            (client_id,),
        ).fetchall()
        manual = conn.execute(
            '''SELECT "sourceLandingId", "targetLandingId", mode
               FROM "LandingInternalLink" WHERE "clientId" = %s AND mode <> 'AUTO' ''',
            (client_id,),
        ).fetchall()
        clusters = conn.execute(
            'SELECT id, "pillarLandingId" FROM "ContentCluster" WHERE "clientId" = %s',
            (client_id,),
        ).fetchall()

        excluded = {(row["sourceLandingId"], row["targetLandingId"]) for row in manual if row["mode"] == "EXCLUDED"}
        pinned: dict[str, list[str]] = {}
        for row in manual:
            if row["mode"] == "PINNED":
                pinned.setdefault(row["sourceLandingId"], []).append(row["targetLandingId"])

        articles: list[Article] = []
        for row in rows:
            try:
                payload = json.loads(row.get("htmlContent") or "{}")
            except Exception:
                payload = {}
            articles.append(Article(
                id=row["id"],
                slug=row["slug"],
                content_type=row["contentType"],
                cluster_id=row.get("contentClusterId"),
                title=str(row.get("titulo") or row.get("seoTitle") or row.get("keyword") or row["slug"]),
                intent=str(row.get("intent") or ""),
                published_at=str(row.get("publishedAt") or ""),
                category_ids={value for value in [payload.get("primary_category_id", ""), *payload.get("secondary_category_ids", [])] if value},
                product_ids=set(payload.get("product_ids", [])),
            ))

        current_pillars = {row["id"]: row["pillarLandingId"] for row in clusters if row.get("pillarLandingId")}
        plan = plan_internal_links(articles, pinned=pinned, excluded=excluded, current_pillars=current_pillars)

        conn.execute('''DELETE FROM "LandingInternalLink" WHERE "clientId" = %s AND mode = 'AUTO' ''', (client_id,))
        for link in plan:
            conn.execute(
                '''INSERT INTO "LandingInternalLink"
                   (id, "clientId", "sourceLandingId", "targetLandingId", "anchorText", position, mode, "updatedAt")
                   VALUES (%s, %s, %s, %s, %s, %s, 'AUTO', NOW())
                   ON CONFLICT ("sourceLandingId", "targetLandingId") DO NOTHING''',
                (generate_cuid(), client_id, link.source_id, link.target_id, link.anchor_text, link.position),
            )

        pillars = pillar_by_cluster(articles, current_pillars)
        for cluster in clusters:
            pillar = pillars.get(cluster["id"])
            pillar_id = pillar.id if pillar else None
            if pillar_id != cluster.get("pillarLandingId"):
                conn.execute('UPDATE "ContentCluster" SET "pillarLandingId" = %s, "updatedAt" = NOW() WHERE id = %s', (pillar_id, cluster["id"]))

    return {
        "published": len(articles),
        "auto_links": len(plan),
        "excluded": len(excluded),
        "pinned": sum(len(value) for value in pinned.values()),
        "links": [{"source": link.source_id, "target": link.target_id, "position": link.position} for link in plan],
    }


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
