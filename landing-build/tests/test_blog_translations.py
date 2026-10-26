"""Traducciones del blog: agrupación hreflang entre el original y sus hermanas."""

import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "agents"))

import build_landings as bl  # noqa: E402


def article(**fields):
    return {"content_type": "GUIDE", "cluster_slug": "controladores", **fields}


def test_traducciones_se_enlazan_con_su_original():
    original = article(id="orig", slug="elegir-controlador", language="es")
    english = article(id="tr1", slug="choose-controller", language="en", translation_of="orig")
    german = article(id="tr2", slug="controller-waehlen", language="de", translation_of="orig")
    alone = article(id="solo", slug="otra-guia", language="es")
    bl.assign_language_alternates([original, english, german, alone], "https://blog.test")
    expected = {"es", "en", "de"}
    for item in (original, english, german):
        assert set(item["_language_alternates"]) == expected
    assert "/en/" in english["_language_alternates"]["en"]
    assert "_language_alternates" not in alone


def test_respeta_el_translation_group_heredado():
    first = article(id="a", slug="guia", language="es", translation_group="guia")
    second = article(id="b", slug="guide", language="en", translation_group="guia")
    bl.assign_language_alternates([first, second], "https://blog.test")
    assert set(first["_language_alternates"]) == {"es", "en"}


def test_traduccion_concurrente_revisa_bajo_lock_antes_de_insertar(monkeypatch):
    import psycopg

    statements = []
    connections = []
    class Result:
        def __init__(self, rows):
            self.rows = rows
        def fetchone(self):
            return self.rows[0] if self.rows else None
        def fetchall(self):
            return self.rows

    class Connection:
        def __enter__(self):
            connections.append(self)
            return self
        def __exit__(self, *args):
            pass
        def execute(self, sql, params):
            statements.append(sql)
            if 'SELECT id, slug' in sql:
                return Result([{"id": "original", "slug": "guia", "status": "DRAFT", "htmlContent": json.dumps({"language": "es", "h1": "Guía", "keyword": "guía"})}])
            if '"htmlContent" LIKE' in sql:
                return Result([] if len(connections) == 1 else [{"id": "existing", "htmlContent": json.dumps({"language": "en", "translation_of": "original"})}])
            return Result([])

    monkeypatch.setenv("DATABASE_URL", "postgresql://test:test@localhost/test")
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"id": "client", "name": "Test"})
    monkeypatch.setattr(psycopg, "connect", lambda *args, **kwargs: Connection())
    monkeypatch.setattr(bl, "chat_json", lambda *args, **kwargs: {"h1": "Guide", "keyword": "guide"})
    monkeypatch.setattr(bl, "render_landing", lambda *args: "")
    monkeypatch.setattr(bl, "load_categories", lambda: {})
    monkeypatch.setattr(bl, "load_products", lambda: {})
    monkeypatch.setattr(bl, "client_blog_url", lambda: "https://blog.test")
    monkeypatch.setattr(bl, "write_report", lambda *args: None)
    result = bl.translate_article("original", "en", "test")
    assert result["existing"] is True
    assert result["translation_id"] == "existing"
    assert any("pg_advisory_xact_lock" in sql for sql in statements)
    assert not any("INSERT INTO" in sql for sql in statements)
    assert all("ARCHIVED" in sql for sql in statements if '"htmlContent" LIKE' in sql)
