"""Plan del día del calendario: producto protagonista, productos excluidos y
rival elegido por el equipo (comparativa libre con aprobación manual)."""
import json
import re
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "agents"))

import build_landings as bl  # noqa: E402

BASE = "https://blog.example.com"
STORE = "https://www.pcmidi.com.ar"
CATEGORIES = {
    "home": {"id": "home", "nombre": "Home", "url": f"{STORE}/", "descripcion": ""},
    "controladores-midi": {"id": "controladores-midi", "nombre": "Controladores MIDI", "url": f"{STORE}/controladores-midi/", "descripcion": "Teclados y pads."},
    "interfaces": {"id": "interfaces", "nombre": "Interfaces de audio", "url": f"{STORE}/interfaces/", "descripcion": "Placas de audio."},
}
PRODUCTS = {
    "minilab-3": {"id": "minilab-3", "nombre": "Arturia MiniLab 3", "marca": "Arturia", "modelo": "MiniLab 3", "categoria_id": "controladores-midi", "uso": "Producir", "url": f"{STORE}/productos/minilab-3/"},
    "keystation-49": {"id": "keystation-49", "nombre": "M-Audio Keystation 49", "marca": "M-Audio", "modelo": "Keystation 49", "categoria_id": "controladores-midi", "uso": "Tocar", "url": f"{STORE}/productos/keystation-49/"},
    "launchpad-x": {"id": "launchpad-x", "nombre": "Novation Launchpad X", "marca": "Novation", "modelo": "Launchpad X", "categoria_id": "controladores-midi", "uso": "Clips", "url": f"{STORE}/productos/launchpad-x/"},
}
CLUSTERS = [{"slug": "controladores-midi", "name": "Controladores MIDI y DAW", "description": ""}]
BODY = {
    "sections": [
        {"h2": "Qué resuelve un controlador", "body": "Un [[c:controladores-midi|controlador MIDI]] te deja tocar instrumentos virtuales.\n\nSi además grabás voces, sumá una [[c:interfaces|interfaz de audio]]."},
        {"h2": "Un ejemplo compacto", "body": "El [[p:minilab-3]] entra en cualquier escritorio."},
        {"h2": "Cómo decidir", "body": "Definí el software y el espacio antes de comparar."},
    ],
    "brand_solution": {"title": "Dónde conseguirlo", "body": "En PC MIDI Center comparás controladores por uso."},
}


def pillar() -> dict:
    return {
        "id": "id-pilar", "slug": "guia-completa-controladores", "keyword": "guia completa controladores", "h1": "Guía completa", "seo_title": "Guía | PC MIDI",
        "meta_description": "Guía completa de controladores.", "primary_category_id": "controladores-midi", "secondary_category_ids": [], "product_ids": [],
        "content_type": "PILLAR", "indexing_state": "INDEX", "cluster_slug": "controladores-midi", "cluster_name": "Controladores MIDI",
        "published_at": "2026-09-01T00:00:00+00:00", "updated_at": "2026-09-01T00:00:00+00:00", "status": "PUBLISHED",
    }


@pytest.fixture
def scheduled(tmp_path, monkeypatch):
    """Generación programada con IA falsa; devuelve (prompts, guardados)."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"id": "c1", "slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "_GENERATION_LANGUAGE", "es")
    monkeypatch.setattr(bl, "_GENERATION_COMPARISON", False)
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "GENERATION_EVENTS_PATH", tmp_path / "reports" / "events.jsonl")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: {k: dict(v) for k, v in PRODUCTS.items()})
    monkeypatch.setattr(bl, "load_content_clusters", lambda: CLUSTERS)
    monkeypatch.setattr(bl, "load_seed_topics", lambda: [{"keyword": "controlador midi para ableton", "source": "seed"}])
    monkeypatch.setattr(bl, "_opportunities_path", lambda: tmp_path / "sin-oportunidades.jsonl")
    monkeypatch.setattr(bl, "load_landings", lambda include_drafts=False: [pillar()])
    monkeypatch.setattr(bl, "load_editorial_source_bank", lambda: [])
    fake_db = types.ModuleType("db_pg")
    fake_db.load_blog_exclusions = lambda client_id: []
    fake_db.load_blog_excluded_products = lambda client_id: ["launchpad-x"]
    monkeypatch.setitem(sys.modules, "db_pg", fake_db)
    prompts: list[tuple[str, str]] = []
    extra: dict = {}

    def fake_chat(system, user, model, temperature=0.35):
        prompts.append((system, user))
        keyword = re.search(r"- keyword: (.+)", user).group(1)
        slug = bl.slugify(keyword)
        generated = {
            "slug": slug, "keyword": keyword, "intent": "comparar", "titulo": keyword, "seo_title": f"{keyword[:50]} | Guía", "meta_description": f"Criterios para {keyword}.",
            "h1": f"Cómo elegir: {keyword}", "hero_lede": "Apertura.", "primary_category_id": "controladores-midi", "secondary_category_ids": [], "product_ids": ["minilab-3"],
            "components": [{"cat": "MIDI", "why": "sirve", "look": "mirar"}], "steps": [{"n": "01", "t": "Paso", "b": "Detalle"}], "faqs": [{"q": "¿Pregunta?", "a": "Respuesta"}],
            **json.loads(json.dumps(BODY)),
        }
        generated["sections"].append(extra.get("section") or {"h2": "Extra", "body": "Probá antes de decidir."})
        return generated

    saved: list[tuple[dict, str]] = []
    monkeypatch.setattr(bl, "chat_json", fake_chat)
    monkeypatch.setattr(bl, "append_landing", lambda landing, schedule_date="": saved.append((dict(landing), schedule_date)) or {"scheduled_date": schedule_date})
    return prompts, saved, extra


def catalog_in_prompt(user: str) -> str:
    return user.split("Catalogo cerrado permitido:", 1)[1].split("\n", 2)[1]


def test_excluded_products_leave_the_catalog(scheduled):
    prompts, saved, _ = scheduled
    summary = bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", exclude_products=["keystation-49"])
    assert summary["created_count"] == 1
    catalog = catalog_in_prompt(prompts[0][1])
    # Global (AppSetting) y del día: ninguno puede citarse con [[p:id]].
    assert "keystation-49" not in catalog and "launchpad-x" not in catalog and "minilab-3" in catalog
    assert "PRODUCTOS EXCLUIDOS" in prompts[0][1] and "M-Audio Keystation 49" in prompts[0][1]
    assert "keystation-49" not in saved[0][0]["product_ids"]


def test_product_topic_puts_the_product_first(scheduled, monkeypatch):
    prompts, saved, _ = scheduled
    monkeypatch.setattr(bl, "_GENERATION_LANGUAGE", "es")
    educational = bl.product_topic("minilab-3", "educational", "", CATEGORIES, PRODUCTS, CLUSTERS, {"controladores-midi"})
    decision = bl.product_topic("minilab-3", "decision", "", CATEGORIES, PRODUCTS, CLUSTERS, {"controladores-midi"})
    assert educational["keyword"] == "Cómo sacarle el máximo provecho a Arturia MiniLab 3"
    assert decision["keyword"] == "Arturia MiniLab 3: para quién conviene"
    with_brief = bl.product_topic("minilab-3", "decision", "Armar un home studio en un monoambiente", CATEGORIES, PRODUCTS, CLUSTERS, {"controladores-midi"})
    assert with_brief["operator_brief"].startswith("Armar un home studio") and with_brief["focus_product_id"] == "minilab-3"

    bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", product_id="minilab-3")
    user = prompts[0][1]
    assert "PRODUCTO PROTAGONISTA: [[p:minilab-3]]" in user and "Arturia MiniLab 3: para quién conviene" in user
    landing = saved[0][0]
    assert landing["product_ids"][0] == "minilab-3" and "minilab-3" in landing["editorial_brief"]["allowedProductIds"]
    assert not landing.get("requires_manual_approval")


def test_excluded_product_cannot_be_protagonist(scheduled):
    prompts, _, _ = scheduled
    bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", product_id="launchpad-x")
    assert "PRODUCTO PROTAGONISTA" not in prompts[0][1]


def test_operator_competitor_builds_free_comparison_without_asking_the_ai(scheduled, monkeypatch):
    prompts, saved, extra = scheduled
    monkeypatch.setattr(bl, "choose_comparison", lambda *a, **k: pytest.fail("no debe elegir rival con IA"))
    extra["section"] = {"h2": "En paralelo", "body": "El Novation Launchkey 25 trae 16 pads. El [[p:minilab-3]] suma perillas para mezclar."}
    bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", product_id="minilab-3", competitor="Novation  Launchkey 25", competitor_notes="Tiene modo Scale.", brief="Para quien arranca a producir")
    system, user = prompts[0]
    assert "COMPARATIVA ELEGIDA POR EL EQUIPO" in system and "Tiene modo Scale." in system and "COMPARATIVA:" not in system
    assert "Arturia MiniLab 3 vs Novation Launchkey 25" in user and "Para quien arranca a producir" in user
    landing = saved[0][0]
    assert landing["comparison"] == {"product_id": "minilab-3", "competitor": "Novation Launchkey 25", "competitor_brand": "Novation", "mode": "free", "notes": "Tiene modo Scale."}
    assert landing["requires_manual_approval"] is True
    checks = {check["id"]: check for check in landing["editorial_quality"]["checks"]}
    assert checks["competitor-claims"]["level"] == "warning"
    assert checks["competitor-claims"]["message"] == "Datos del rival escritos por la IA: verificalos antes de publicar."
    # En modo libre no se borran los datos del rival.
    assert any("16 pads" in section["body"] for section in landing["sections"])


def test_competitor_without_product_picks_one_without_ai(scheduled, monkeypatch):
    prompts, saved, _ = scheduled
    monkeypatch.setattr(bl, "choose_comparison", lambda *a, **k: pytest.fail("no debe elegir con IA"))
    bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", competitor="Akai MPK Mini MK3")
    assert len(prompts) >= 1 and saved[0][0]["comparison"]["product_id"] in {"minilab-3", "keystation-49"}


def test_priority_competitors_are_selected_and_require_review(scheduled, monkeypatch):
    prompts, saved, _ = scheduled
    monkeypatch.setattr(sys.modules["db_pg"], "load_blog_priority_competitors", lambda client_id: ["Roland FP-10", "Yamaha P-225"], raising=False)
    monkeypatch.setattr(bl, "_GENERATION_COMPARISON", True)
    bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01", intent="decision")
    assert saved[0][0]["comparison"]["competitor"] == "Roland FP-10"
    assert saved[0][0]["comparison"]["mode"] == "priority"
    assert saved[0][0]["requires_manual_approval"] is True
    assert "COMPARATIVA:" in prompts[-1][0]
    assert "COMPARATIVA ELEGIDA POR EL EQUIPO" not in prompts[-1][0]
    prior = [{"comparison": {"competitor": "Roland FP-10"}}]
    choice = bl.choose_comparison(CATEGORIES, {"minilab-3": PRODUCTS["minilab-3"]}, prior, "test", ["Roland FP-10", "Yamaha P-225"])
    assert choice == {"product_id": "minilab-3", "competitor": "Yamaha P-225", "competitor_brand": "Yamaha", "mode": "priority"}
    landing = bl.apply_editorial_metadata({"comparison": choice}, {"product_ids": []}, CLUSTERS[0])
    assert landing["requires_manual_approval"] is True


def test_excluded_product_named_in_text_is_an_error():
    topic = {"_excluded_names": bl.excluded_product_names({"launchpad-x": PRODUCTS["launchpad-x"]}, {"minilab-3": PRODUCTS["minilab-3"]}), "_excluded_ids": ["launchpad-x"]}
    clean = bl.apply_day_plan_checks({"sections": [{"h2": "a", "body": "El [[p:minilab-3]] alcanza."}]}, topic)
    assert not any(c["id"] == "excluded-product" for c in clean["editorial_quality"]["checks"])
    dirty = bl.apply_day_plan_checks({"sections": [{"h2": "a", "body": "Si querés clips, el launchpad x también sirve."}], "editorial_quality": {"checks": [], "publishable": True}}, topic)
    check = next(c for c in dirty["editorial_quality"]["checks"] if c["id"] == "excluded-product")
    assert check["level"] == "error" and "Launchpad X" in check["message"] and dirty["editorial_quality"]["publishable"] is False
    # Idempotente: volver a revisar no duplica el control.
    again = bl.apply_day_plan_checks(dirty, topic)
    assert [c["id"] for c in again["editorial_quality"]["checks"]].count("excluded-product") == 1


def test_free_mode_skips_competitor_scrub():
    landing = {"comparison": {"product_id": "minilab-3", "competitor": "Novation Launchkey 25", "competitor_brand": "Novation", "mode": "free"}, "sections": [{"h2": "a", "body": "Novation trae 16 pads."}]}
    assert bl.scrub_competitor_claims(landing, PRODUCTS)["sections"][0]["body"] == "Novation trae 16 pads."


def test_scheduled_attach_can_require_approval():
    import importlib
    sys.modules.pop("db_pg", None)
    db_pg = importlib.import_module("db_pg")

    class Connection:
        sql = ""
        args = None

        def execute(self, sql, args):
            self.sql, self.args = sql, args
            return self

        def fetchone(self):
            return {"id": "slot"}

    connection = Connection()
    db_pg._attach_scheduled_landing(connection, "client", "article", "2026-11-01", "", True)
    assert '"requiresApproval" = CASE WHEN %s THEN true ELSE "requiresApproval" END' in connection.sql
    assert True in connection.args


def test_generate_cli_accepts_day_plan_args(monkeypatch):
    seen = {}
    monkeypatch.setattr(bl, "generate_landings", lambda **kwargs: seen.update(kwargs))
    monkeypatch.setattr(sys, "argv", ["build_landings.py", "generate", "--limit", "1", "--schedule-date", "2026-10-01", "--product-id", "minilab-3", "--exclude-products", "a, b,,c", "--competitor", "Novation Launchkey 25", "--competitor-notes", "notas"])
    try:
        bl.main()
    except SystemExit:
        pass
    assert seen["product_id"] == "minilab-3" and seen["exclude_products"] == ["a", "b", "c"]
    assert seen["competitor"] == "Novation Launchkey 25" and seen["competitor_notes"] == "notas"


def test_scheduled_attach_targets_only_daily_topic(monkeypatch):
    import importlib
    db_pg = importlib.import_module("db_pg")
    class Connection:
        def execute(self, sql, args):
            self.sql, self.args = sql, args
            return self
        def fetchone(self):
            return {"id": "slot"}
    connection = Connection()
    monkeypatch.setenv("BLOG_DAILY_SLOT", "2")
    db_pg._attach_scheduled_landing(connection, "client", "article", "2026-11-01")
    assert '\"dailySlot\" = %s' in connection.sql
    assert connection.args[9] == 2
