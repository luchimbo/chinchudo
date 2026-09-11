"""Blog editorial: rutas, indexación, grafo, sitemap, auditoría y cuota.

Construye un sitio real en un directorio temporal con datos sintéticos, sin
base de datos (el builder cae al planificador local de enlaces).
"""

import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent / "agents"))

import build_landings as bl  # noqa: E402
from site_audit import audit_site  # noqa: E402

BASE = "https://blog.example.com"
STORE = "https://www.pcmidi.com.ar"

CATEGORIES = {
    "home": {"id": "home", "nombre": "Home", "url": f"{STORE}/", "descripcion": ""},
    "controladores-midi": {"id": "controladores-midi", "nombre": "Controladores MIDI", "url": f"{STORE}/controladores-midi/", "descripcion": "Teclados y pads."},
    "interfaces": {"id": "interfaces", "nombre": "Interfaces de audio", "url": f"{STORE}/interfaces/", "descripcion": "Placas de audio."},
}
PRODUCTS = {
    "minilab-3": {"id": "minilab-3", "nombre": "Arturia MiniLab 3", "marca": "Arturia", "modelo": "MiniLab 3", "categoria_id": "controladores-midi", "uso": "Producir", "url": f"{STORE}/productos/minilab-3/"},
}


def article(slug: str, cluster: str, content_type: str = "GUIDE", days_ago: int = 30, category: str = "controladores-midi", **extra) -> dict:
    moment = (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()
    return {
        "id": f"id-{slug}",
        "slug": slug,
        "keyword": slug.replace("-", " "),
        "intent": "comparar",
        "titulo": slug.replace("-", " ").title(),
        "seo_title": f"{slug} | Guía",
        "meta_description": f"Descripción única para {slug} con criterios prácticos.",
        "h1": f"Título {slug}",
        "hero_lede": "Texto de apertura.",
        "primary_category_id": category,
        "secondary_category_ids": [],
        "product_ids": ["minilab-3"] if category == "controladores-midi" else [],
        "components": [{"cat": "MIDI", "why": "sirve", "look": "mirar"}],
        "steps": [{"n": "01", "t": "Paso", "b": "Detalle"}],
        "faqs": [{"q": "¿Pregunta?", "a": "Respuesta"}],
        "content_type": content_type,
        "indexing_state": "INDEX",
        "cluster_slug": cluster,
        "cluster_name": cluster.replace("-", " ").title(),
        "published_at": moment,
        "updated_at": moment,
        **extra,
    }


def legacy(slug: str) -> dict:
    data = article(slug, "", "LEGACY")
    for key in ("content_type", "indexing_state", "cluster_slug", "cluster_name"):
        data.pop(key)
    return data


@pytest.fixture()
def site(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "SITE_DIR", tmp_path / "site")
    monkeypatch.setattr(bl, "ASSETS_DIR", tmp_path / "site" / "assets")
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_lead_magnets", lambda: {})
    clusters = [
        {"slug": "controladores-midi", "name": "Controladores MIDI y DAW", "description": "Guías de controladores."},
        {"slug": "grabacion-en-casa", "name": "Grabación en casa", "description": "Guías de grabación."},
    ]
    monkeypatch.setattr(bl, "load_content_clusters", lambda: clusters)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})

    landings = [
        legacy("controlador-midi-para-fl-studio"),
        legacy("mejor-placa-de-audio"),
        article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=40, direct_answer="Elegí por teclas y software.", common_mistakes=["Comprar sin mirar la DAW."]),
        *(article(f"controlador-guia-{index}", "controladores-midi", days_ago=30 - index) for index in range(1, 8)),
        article("guia-completa-grabacion", "grabacion-en-casa", "PILLAR", days_ago=20, category="interfaces"),
        article("interfaz-para-voz", "grabacion-en-casa", days_ago=5, category="interfaces"),
    ]
    monkeypatch.setattr(bl, "load_landings", lambda: [dict(item) for item in landings])
    summary = bl.build(base_url=BASE)
    return summary, tmp_path / "site"


def read(site_dir: Path, path: str) -> str:
    return (site_dir / path.strip("/") / "index.html").read_text(encoding="utf-8")


def internal_hrefs(html_text: str) -> list[str]:
    return re.findall(r'<a href="(/[^"]*)" data-internal-link="true"', html_text)


def test_build_passes_audit(site):
    summary, _ = site
    assert summary["status"] == "ok"
    assert summary["broken_links"] == 0
    assert summary["orphans"] == []
    assert summary["published_articles"] == 10
    assert summary["noindex_pages"] == 2


def test_legacy_stays_reachable_noindex_and_out_of_sitemap(site):
    _, site_dir = site
    html_text = read(site_dir, "/controlador-midi-para-fl-studio/")
    assert '<meta name="robots" content="noindex,follow">' in html_text
    assert f'<link rel="canonical" href="{BASE}/controlador-midi-para-fl-studio/">' in html_text
    sitemap = (site_dir / "sitemap.xml").read_text(encoding="utf-8")
    assert "controlador-midi-para-fl-studio" not in sitemap
    assert "Disallow" not in (site_dir / "robots.txt").read_text(encoding="utf-8")


def test_editorial_article_structure(site):
    _, site_dir = site
    path = "/guias/controladores-midi/controlador-guia-3/"
    html_text = read(site_dir, path)
    assert f'<link rel="canonical" href="{BASE}{path}">' in html_text
    assert '<meta name="robots" content="index,follow">' in html_text
    assert len(re.findall(r"<h1[\s>]", html_text)) == 1
    assert '"@type": "BlogPosting"' in html_text and '"@type": "BreadcrumbList"' in html_text
    assert 'property="og:title"' in html_text and 'name="twitter:card"' in html_text
    assert "internal_link_click" in html_text
    assert "{{ " not in html_text
    hrefs = internal_hrefs(html_text)
    assert "/guias/controladores-midi/guia-completa-controladores/" in hrefs  # pilar
    assert "/guias/controladores-midi/" in hrefs  # breadcrumb al hub
    related = [href for href in hrefs if href.count("/") == 4 and "guia-completa" not in href]
    assert 3 <= len(set(related)) <= 4
    assert path not in hrefs


def test_pillar_lists_every_guide_and_renders_editorial_blocks(site):
    _, site_dir = site
    html_text = read(site_dir, "/guias/controladores-midi/guia-completa-controladores/")
    for index in range(1, 8):
        assert f"/guias/controladores-midi/controlador-guia-{index}/" in html_text
    assert "Respuesta rápida" in html_text and "Errores frecuentes" in html_text
    assert "/guias/grabacion-en-casa/" not in "".join(internal_hrefs(html_text))


def test_every_guide_receives_two_inbound_links_from_guides(site):
    _, site_dir = site
    inbound: dict[str, set[str]] = {}
    for index in range(1, 8):
        source = f"/guias/controladores-midi/controlador-guia-{index}/"
        for href in internal_hrefs(read(site_dir, source)):
            inbound.setdefault(href, set()).add(source)
    for index in range(1, 8):
        assert len(inbound.get(f"/guias/controladores-midi/controlador-guia-{index}/", set())) >= 2


def test_home_and_hubs_link_the_graph(site):
    _, site_dir = site
    home = (site_dir / "index.html").read_text(encoding="utf-8")
    assert 'href="/guias/controladores-midi/"' in home and 'href="/guias/grabacion-en-casa/"' in home
    assert "controlador-midi-para-fl-studio" not in home  # el legado no se promociona
    hub = read(site_dir, "/guias/controladores-midi/")
    assert hub.index("guia-completa-controladores") < hub.index("controlador-guia-7")
    assert f'<link rel="canonical" href="{BASE}/guias/controladores-midi/">' in hub


def test_sitemap_uses_real_lastmod(site):
    _, site_dir = site
    sitemap = (site_dir / "sitemap.xml").read_text(encoding="utf-8")
    locs = re.findall(r"<loc>([^<]+)</loc>", sitemap)
    assert f"{BASE}/" in locs and f"{BASE}/guias/controladores-midi/" in locs
    assert len(locs) == 1 + 2 + 10
    expected = (datetime.now(timezone.utc) - timedelta(days=5)).date().isoformat()
    assert f"<loc>{BASE}/guias/grabacion-en-casa/interfaz-para-voz/</loc><lastmod>{expected}</lastmod>" in sitemap


def test_hub_pagination_is_crawlable(monkeypatch):
    monkeypatch.setattr(bl, "HUB_PAGE_SIZE", 3)
    cluster = {"slug": "controladores-midi", "name": "Controladores", "description": ""}
    landings = [article("pilar", "controladores-midi", "PILLAR"), *(article(f"g-{index}", "controladores-midi", days_ago=index) for index in range(1, 8))]
    pages = bl.hub_pages(cluster, landings)
    assert [page["path"] for page in pages] == ["/guias/controladores-midi/", "/guias/controladores-midi/pagina/2/", "/guias/controladores-midi/pagina/3/"]
    second = bl.render_cluster_hub(cluster, pages[1], BASE)
    assert 'rel="prev" href="/guias/controladores-midi/"' in second
    assert 'rel="next" href="/guias/controladores-midi/pagina/3/"' in second
    assert f'<link rel="canonical" href="{BASE}/guias/controladores-midi/pagina/2/">' in second


def test_audit_blocks_broken_links_orphans_and_bad_canonicals(tmp_path):
    def page(path: str, body: str, canonical: str | None = None) -> None:
        target = tmp_path / path.strip("/") / "index.html" if path != "/" else tmp_path / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f'<html><head><link rel="canonical" href="{canonical or BASE + path}"><meta name="robots" content="index,follow"></head><body><h1>x</h1>{body}</body></html>', encoding="utf-8")

    page("/", '<a href="/guias/a/uno/">uno</a><a href="/no-existe/">roto</a>')
    page("/guias/a/uno/", "")
    page("/guias/a/huerfana/", "", canonical=f"{BASE}/otra/")
    result = audit_site(tmp_path, BASE, [f"{BASE}/"], {"/guias/a/uno/", "/guias/a/huerfana/"})
    assert result["status"] == "blocked"
    assert any("enlace roto" in error for error in result["errors"])
    assert any("huérfana: /guias/a/huerfana/" in error for error in result["errors"])
    assert any("canonical incorrecta en /guias/a/huerfana/" in error for error in result["errors"])


def test_preview_is_noindex_nofollow():
    html_text = '<head><meta name="robots" content="index,follow"></head>'
    assert bl.mark_preview_noindex(html_text) == '<head><meta name="robots" content="noindex,nofollow"></head>'


def test_pillar_topic_keeps_its_cluster(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    clusters = [dict(item) for item in bl.EDITORIAL_CLUSTERS]
    topics = bl.editorial_pillar_topics(clusters, [])
    monitoring = next(topic for topic in topics if topic["cluster_slug"] == "monitoreo-home-studio")
    # "home studio" también es término de grabación: el cluster preasignado manda.
    assert bl.editorial_cluster_for(monitoring, clusters)["slug"] == "monitoreo-home-studio"
    assert bl.editorial_cluster_for({"keyword": "mejor interfaz para grabar voz"}, clusters)["slug"] == "grabacion-en-casa"
    assert bl.editorial_cluster_for({"keyword": "zapatillas de running"}, clusters) is None


def test_editorial_candidate_validation(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    clusters = [{"slug": "controladores-midi", "name": "Controladores"}, {"slug": "sintetizadores", "name": "Sintes"}]
    existing = [article("controlador-midi-para-ableton", "controladores-midi"), legacy("minilab-3-review-completa")]
    candidate = article("otra-guia", "controladores-midi", keyword="teclado para grabar podcasts")
    assert bl.validate_editorial_candidate(candidate, existing, clusters, {"controladores-midi"}) == []
    duplicated = article("otra", "controladores-midi", h1=existing[0]["h1"], keyword="tema distinto")
    assert any("h1 duplicado" in error for error in bl.validate_editorial_candidate(duplicated, existing, clusters, {"controladores-midi"}))
    cannibal = article("otra", "controladores-midi", keyword="controlador midi para ableton live")
    assert any("canibaliza" in error for error in bl.validate_editorial_candidate(cannibal, existing, clusters, {"controladores-midi"}))
    no_pillar = article("sinte", "sintetizadores", keyword="primer sintetizador analógico")
    assert any("no tiene artículo pilar" in error for error in bl.validate_editorial_candidate(no_pillar, existing, clusters, {"controladores-midi"}))


def test_weekly_quota_counts_only_this_week(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    monkeypatch.delenv("DATABASE_URL", raising=False)
    now = datetime(2026, 9, 10, 12, tzinfo=timezone.utc)  # jueves
    this_week = [article(f"a{index}", "controladores-midi", days_ago=0) for index in range(2)]
    for item in this_week:
        item["published_at"] = (now - timedelta(days=1)).isoformat()
    last_week = article("vieja", "controladores-midi")
    last_week["published_at"] = (now - timedelta(days=5)).isoformat()  # sábado anterior
    assert bl.count_published_this_week([*this_week, last_week, legacy("x")], now=now) == 2


def test_generation_publishes_three_then_queues(tmp_path, monkeypatch):
    """Cuota semanal: las tres primeras válidas se publican; la cuarta espera."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "GENERATION_EVENTS_PATH", tmp_path / "reports" / "events.jsonl")
    monkeypatch.setattr(bl, "LANDINGS_PATH", tmp_path / "landings.jsonl")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "controladores-midi", "name": "Controladores MIDI y DAW", "description": ""}])
    monkeypatch.setattr(bl, "load_seed_topics", lambda: [{"keyword": keyword, "source": "seed"} for keyword in ("controlador midi para ableton", "pads midi para beatmaking", "teclado midi de 49 teclas", "controlador midi con faders")])
    monkeypatch.setattr(bl, "_opportunities_path", lambda: tmp_path / "sin-oportunidades.jsonl")
    pillar = article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=30)
    stored: list[dict] = [pillar]
    monkeypatch.setattr(bl, "load_landings", lambda: [dict(item) for item in stored])

    def fake_chat(system, user, model, temperature=0.35):
        keyword = re.search(r"- keyword: (.+)", user).group(1)
        generated = article(bl.slugify(keyword), "controladores-midi", keyword=keyword, h1=f"Cómo elegir: {keyword}", seo_title=f"{keyword} | Guía", meta_description=f"Criterios para {keyword}.")
        for key in ("content_type", "indexing_state", "cluster_slug", "cluster_name", "published_at", "updated_at", "id"):
            generated.pop(key, None)
        return generated

    monkeypatch.setattr(bl, "chat_json", fake_chat)
    monkeypatch.setattr(bl, "append_landing", lambda landing: stored.append(dict(landing)) or {})
    summary = bl.generate_landings(limit=10, model="test")
    assert summary["created_count"] == 3
    assert summary["stopped_reason"] == "weekly_quota_reached"
    assert all(item["contentType"] == "GUIDE" and item["cluster"] == "controladores-midi" for item in summary["created"])
    assert all(item["url"].startswith(f"{BASE}/guias/controladores-midi/") for item in summary["created"])

    again = bl.generate_landings(limit=10, model="test")
    assert again["created_count"] == 0
    assert again["stopped_reason"] == "weekly_quota_reached"
