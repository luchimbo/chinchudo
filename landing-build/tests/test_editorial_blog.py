"""Blog editorial: rutas, indexación, grafo, sitemap, auditoría y cuota.

Construye un sitio real en un directorio temporal con datos sintéticos, sin
base de datos (el builder cae al planificador local de enlaces).
"""

import re
import json
import io
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

# Cuerpo mínimo válido: secciones con marcadores del catálogo y cierre de marca.
BODY = {
    "sections": [
        {"h2": "Qué resuelve un controlador", "body": "Un [[c:controladores-midi|controlador MIDI]] te deja tocar instrumentos virtuales.\n\nSi además grabás voces, sumá una [[c:interfaces|interfaz de audio]]."},
        {"h2": "Un ejemplo compacto", "body": "El [[p:minilab-3]] entra en cualquier escritorio. Otra mención del [[p:minilab-3]] no se enlaza dos veces."},
        {"h2": "Cómo decidir", "body": "Definí el software y el espacio antes de comparar. [[p:no-existe|Modelo inventado]] queda como texto."},
    ],
    "brand_solution": {"title": "Dónde conseguirlo", "body": "En PC MIDI Center comparás controladores por uso."},
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
        {**legacy("controlador-barato-indexable"), "indexing_state": "INDEX"},
        article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=40, direct_answer="Elegí por teclas y software.", common_mistakes=["Comprar sin mirar la DAW."]),
        article("controlador-guia-1", "controladores-midi", days_ago=29, **BODY),
        *(article(f"controlador-guia-{index}", "controladores-midi", days_ago=30 - index) for index in range(2, 8)),
        article("guia-completa-grabacion", "grabacion-en-casa", "PILLAR", days_ago=20, category="interfaces"),
        article("interfaz-para-voz", "grabacion-en-casa", days_ago=5, category="interfaces"),
        article(
            "interfaz-con-cuerpo", "grabacion-en-casa", days_ago=6, category="interfaces", product_ids=["minilab-3"],
            common_mistakes=["Comprar sin pensar en la voz."],
            **{**BODY, "sections": [*BODY["sections"], {"h2": "Seguí", "body": "Empezá por [[g:guia-completa-grabacion|la guía completa]]."}]},
        ),
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
    assert summary["published_articles"] == 11
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
    assert bl.MAX_RELATED - 2 <= len(set(related)) <= bl.MAX_RELATED
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
    assert len(locs) == 1 + 2 + 11 + 1  # portada, hubs, artículos y la landing suelta indexable
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
    monkeypatch.setattr(bl, "MAX_EDITORIAL_PER_WEEK", 3)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "GENERATION_EVENTS_PATH", tmp_path / "reports" / "events.jsonl")
    monkeypatch.setattr(bl, "LANDINGS_PATH", tmp_path / "landings.jsonl")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "controladores-midi", "name": "Controladores MIDI y DAW", "description": ""}])
    monkeypatch.setattr(bl, "load_seed_topics", lambda: [{"keyword": keyword, "source": "seed"} for keyword in ("controlador midi para ableton", "pads midi para beatmaking", "teclado midi para piano", "controlador midi con faders")])
    monkeypatch.setattr(bl, "_opportunities_path", lambda: tmp_path / "sin-oportunidades.jsonl")
    pillar = article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=30)
    stored: list[dict] = [pillar]
    monkeypatch.setattr(bl, "load_landings", lambda: [dict(item) for item in stored])

    def fake_chat(system, user, model, temperature=0.35):
        keyword = re.search(r"- keyword: (.+)", user).group(1)
        generated = article(bl.slugify(keyword), "controladores-midi", keyword=keyword, h1=f"Cómo elegir: {keyword}", seo_title=f"{keyword} | Guía", meta_description=f"Criterios para {keyword}.")
        for key in ("content_type", "indexing_state", "cluster_slug", "cluster_name", "published_at", "updated_at", "id"):
            generated.pop(key, None)
        generated.update({**BODY, "components": [{"cat": "Uso", "why": "Tu tarea", "look": "La forma de tocar"}, {"cat": "Espacio", "why": "Tu lugar", "look": "La mesa"}], "direct_answer": "Elegí según tu forma de tocar, el espacio disponible y los controles que necesitás para trabajar con instrumentos virtuales.", "sections": [*BODY["sections"][:2], {"h2": "Cómo decidir", "body": "Definí el software y el espacio antes de comparar."}]})
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


def test_scheduled_generation_creates_private_draft_without_quota(tmp_path, monkeypatch):
    """Programado: reserva fecha, no usa la cuota semanal y no fija published_at."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(bl, "MAX_EDITORIAL_PER_WEEK", 0)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"id": "c1", "slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "GENERATION_EVENTS_PATH", tmp_path / "reports" / "events.jsonl")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "controladores-midi", "name": "Controladores MIDI y DAW", "description": ""}])
    monkeypatch.setattr(bl, "load_seed_topics", lambda: [{"keyword": "controlador midi para ableton", "source": "seed"}])
    monkeypatch.setattr(bl, "_opportunities_path", lambda: tmp_path / "sin-oportunidades.jsonl")
    monkeypatch.setattr(bl, "load_landings", lambda include_drafts=False: [article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=30)])

    def fake_chat(system, user, model, temperature=0.35):
        keyword = re.search(r"- keyword: (.+)", user).group(1)
        generated = article(bl.slugify(keyword), "controladores-midi", keyword=keyword, h1=f"Cómo elegir: {keyword}", seo_title=f"{keyword} | Guía", meta_description=f"Criterios para {keyword}.")
        for key in ("content_type", "indexing_state", "cluster_slug", "cluster_name", "published_at", "updated_at", "id"):
            generated.pop(key, None)
        generated.update(BODY)
        return generated

    saved: list[tuple[dict, str]] = []
    monkeypatch.setattr(bl, "chat_json", fake_chat)
    monkeypatch.setattr(bl, "append_landing", lambda landing, schedule_date="": saved.append((dict(landing), schedule_date)) or {"scheduled_date": schedule_date})
    summary = bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01")
    assert summary["created_count"] == 1
    assert saved[0][1] == "2026-10-01"
    assert not saved[0][0].get("published_at")


def test_scheduled_generation_requires_postgres(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_landings", lambda include_drafts=False: [])
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "x", "name": "X", "description": ""}])
    with pytest.raises(RuntimeError):
        bl.generate_landings(limit=1, model="test", schedule_date="2026-10-01")


def test_preview_renders_unsaved_editor_content(monkeypatch, capsysbinary):
    """El editor previsualiza el borrador sin guardar sobre el artículo real."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_lead_magnets", lambda: {})
    base = {**article("guia-borrador", "controladores-midi"), **BODY}
    monkeypatch.setattr(bl, "load_preview_landing", lambda landing_id="": dict(base) if landing_id == "id-1" else None)
    override = {"h1": "Título editado sin guardar", "sections": [*BODY["sections"][:2], {"h2": "Sección nueva editada", "body": "Mirá el [[p:minilab-3|MiniLab]]."}]}
    bl.preview_command(landing_id="id-1", base_url=BASE, content_override=override)
    html_text = capsysbinary.readouterr().out.decode("utf-8")
    assert "Título editado sin guardar" in html_text and "Sección nueva editada" in html_text
    assert 'content="noindex,nofollow"' in html_text
    with pytest.raises(SystemExit):
        bl.preview_command(landing_id="otro", base_url=BASE, content_override=override)


def test_article_body_links_store_inside_text(site):
    _, site_dir = site
    html_text = read(site_dir, "/guias/grabacion-en-casa/interfaz-con-cuerpo/")
    body = html_text[html_text.index('article-body"'):html_text.index('class="mega article-solution"')]
    assert f'<a href="{STORE}/controladores-midi/" data-store-link="true" data-link-type="category" data-target="controladores-midi">controlador MIDI</a>' in body
    assert f'href="{STORE}/interfaces/"' in body
    assert body.count(f'href="{STORE}/productos/minilab-3/"') == 1  # primera mención
    assert "Modelo inventado" in body and "no-existe" not in body
    assert 'target="_blank"' not in body
    assert '<a href="/guias/grabacion-en-casa/guia-completa-grabacion/" data-internal-link="true" data-link-type="inline"' in body
    assert "[[" not in html_text


def test_editorial_article_uses_landing_design_with_article_content(site):
    _, site_dir = site
    html_text = read(site_dir, "/guias/grabacion-en-casa/interfaz-con-cuerpo/")
    # Misma base visual que las landings: template activo, header y clases.
    assert '<body class="article-page tpl-' in html_text and 'class="site-header"' in html_text
    assert 'class="hero-title' in html_text and 'class="faq-grid"' in html_text
    assert "Dónde conseguirlo" in html_text and 'class="mega article-solution"' in html_text
    assert 'data-link-type="solution_product"' in html_text and 'data-link-type="solution_cta"' in html_text
    for landing_block in ('class="comp-card"', "Opciones recomendadas", 'class="hero-ctas', 'class="steps-list"', 'href="#productos"'):
        assert landing_block not in html_text[html_text.index("<body"):]
    assert '"@type": "FAQPage"' not in html_text and '"@type": "BlogPosting"' in html_text
    assert html_text.index("Errores frecuentes") < html_text.index('class="mega article-solution"')


def test_editorial_without_body_uses_its_criteria(site):
    _, site_dir = site
    html_text = read(site_dir, "/guias/controladores-midi/guia-completa-controladores/")
    assert '<section id="seccion-1"><h2>MIDI</h2>' in html_text
    assert 'data-link-type="category" data-target="controladores-midi"' in html_text
    assert "Paso a paso para decidir" in html_text


def test_legacy_page_keeps_landing_template(site):
    _, site_dir = site
    html_text = read(site_dir, "/controlador-midi-para-fl-studio/")
    assert 'article-body"' not in html_text
    assert "product-pill" in html_text


def test_editorial_validation_requires_body_markers_and_solution(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    clusters = [{"slug": "controladores-midi", "name": "Controladores"}]
    validate = lambda candidate: bl.validate_editorial_candidate(candidate, [], clusters, {"controladores-midi"}, CATEGORIES, PRODUCTS)
    assert validate(article("con-cuerpo", "controladores-midi", **BODY)) == []
    errors = validate(article("sin-cuerpo", "controladores-midi"))
    assert any("secciones" in error for error in errors) and any("brand_solution" in error for error in errors)
    unknown = {**BODY, "sections": [{"h2": f"S{index}", "body": "[[p:no-existe]] y [[c:tampoco]]"} for index in range(3)]}
    assert any("cita menos" in error for error in validate(article("marcadores-falsos", "controladores-midi", **unknown)))


def test_catalogue_fallback_passes_editorial_validation(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center"})
    landing = bl.normalize_generated_landing(bl.catalogue_fallback_landing({"keyword": "controlador midi", "categorias_sugeridas": "controladores-midi;interfaces"}, CATEGORIES, PRODUCTS))
    landing.update({"content_type": "GUIDE", "cluster_slug": "controladores-midi"})
    assert bl.validate_editorial_candidate(landing, [], [{"slug": "controladores-midi"}], {"controladores-midi"}, CATEGORIES, PRODUCTS) == []


def test_regenerate_keeps_identity_and_blocks_invalid_output(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "controladores-midi", "name": "Controladores MIDI y DAW"}])
    pillar = article("guia-completa-controladores", "controladores-midi", "PILLAR", days_ago=10)
    monkeypatch.setattr(bl, "load_landings", lambda: [dict(pillar)])
    saved: list[dict] = []
    monkeypatch.setattr(bl, "persist_regenerated_landing", saved.append)
    responses = [
        {**article("otro-slug", "", h1="Sin cuerpo"), "content_type": None},
        {**article("otro-slug", "", h1="Guía nueva de controladores", seo_title="Controladores MIDI | Guía nueva"), **BODY},
    ]
    monkeypatch.setattr(bl, "chat_json", lambda system, user, model, temperature=0.35: responses.pop(0))

    summary = bl.regenerate_editorial(["guia-completa-controladores", "no-existe"], model="test")
    assert [item["status"] for item in summary["results"]] == ["updated", "not_found"]
    assert len(saved) == 1
    regenerated = saved[0]
    assert regenerated["slug"] == pillar["slug"] and regenerated["published_at"] == pillar["published_at"]
    assert regenerated["content_type"] == "PILLAR" and regenerated["cluster_slug"] == "controladores-midi"
    assert regenerated["h1"] == "Guía nueva de controladores" and len(regenerated["sections"]) == 3


def test_article_body_cites_related_guides_inline(site):
    _, site_dir = site
    html_text = read(site_dir, "/guias/controladores-midi/controlador-guia-1/")
    callout = re.search(r'<aside class="article-callout">(.*?)</aside>', html_text, re.DOTALL)
    assert callout and "Leé también" in callout.group(1)
    cited = set(re.findall(r'href="(/guias/[^"]+)"', callout.group(1)))
    assert len(cited) == 2
    related_box = html_text.split('aria-label="Guías relacionadas"', 1)[1]
    assert not cited & set(re.findall(r'href="(/guias/[^"]+)"', related_box))  # sin repetir abajo


def test_indexable_legacy_landing_cites_the_blog(site):
    _, site_dir = site
    html_text = read(site_dir, "/controlador-barato-indexable/")
    assert "Guías del blog sobre este tema" in html_text
    hrefs = set(internal_hrefs(html_text))
    assert "/guias/controladores-midi/guia-completa-controladores/" in hrefs
    assert 1 <= len(hrefs) <= bl.MAX_RELATED
    # Sólo origen: ninguna guía la enlaza.
    for index in range(1, 8):
        assert "/controlador-barato-indexable/" not in read(site_dir, f"/guias/controladores-midi/controlador-guia-{index}/")


def test_noindex_legacy_does_not_cite(site):
    _, site_dir = site
    assert "Guías del blog sobre este tema" not in read(site_dir, "/controlador-midi-para-fl-studio/")


def test_linkable_articles_ranked_by_cluster_then_catalog():
    topic = {"cluster_slug": "controladores-midi", "categorias_sugeridas": "interfaces"}
    items = [
        article("otra-sin-relacion", "grabacion-en-casa", category="home"),
        article("interfaz-relacionada", "grabacion-en-casa", category="interfaces"),
        article("guia-mismo-cluster", "controladores-midi"),
        article("pilar-mismo-cluster", "controladores-midi", "PILLAR"),
    ]
    ranked = [item["slug"] for item in bl.rank_linkable_articles(topic, items)]
    assert ranked == ["pilar-mismo-cluster", "guia-mismo-cluster", "interfaz-relacionada"]


def test_sources_comparison_and_marked_revision_match_visible_article(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center", "storeUrl": STORE, "blogBaseUrl": BASE})
    source = {"id": "manual", "title": "Manual del fabricante", "url": "https://manufacturer.example/manual", "type": "manufacturer", "verifiedAt": "2026-10-01T10:00:00Z", "claims": ["Dato revisado"]}
    content = article("comparativa", "controladores-midi", **BODY, source_refs=[source], publication_token="revision-verificada", decision_support={"criteria": ["Uso", "Espacio"], "options": [{"product_id": "minilab-3", "suitable_for": "Producir", "advantages": "Dato revisado [[s:manual]]", "limitations": "Revisá el espacio", "evidence_ids": ["manual"]}], "recommendation": "Decidí según el uso."})
    html_text = bl.render_landing(content, CATEGORIES, PRODUCTS, BASE, {})
    assert 'id="fuente-manual"' in html_text and 'href="#fuente-manual"' in html_text
    assert 'href="https://manufacturer.example/manual"' in html_text
    assert "Comparación para elegir" in html_text and "Revisá el espacio" in html_text
    assert '<meta name="editorial-revision" content="revision-verificada">' in html_text
    assert "internal?'internal_link_click':'store_click'" in html_text
    schemas = [json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html_text, re.DOTALL)]
    posting = next(s for s in schemas if s.get("@type") == "BlogPosting")
    assert posting["citation"][0]["url"] == source["url"]
    assert not any(s.get("@type") == "FAQPage" for s in schemas)
    content.pop("published_at")
    preview = bl.render_landing(content, CATEGORIES, PRODUCTS, BASE, {})
    assert '"datePublished"' not in preview


def test_pc_midi_live_generation_requires_calendar(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"id": "c1", "slug": "pcmidi"})
    with pytest.raises(RuntimeError, match="calendario"):
        bl.generate_landings(limit=1, model="test")
    with pytest.raises(RuntimeError, match="editor"):
        bl.regenerate_editorial(["publicado"], model="test")


def test_editorial_request_bounds_output_and_configured_deepseek_reasoning(monkeypatch):
    monkeypatch.setattr(bl, "load_env", lambda: None)
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("BLOG_LLM_REASONING_ENABLED", raising=False)
    monkeypatch.delenv("BLOG_LLM_MAX_TOKENS", raising=False)
    payloads = []

    def respond(request, timeout):
        payloads.append(json.loads(request.data))
        return io.BytesIO(json.dumps({"choices": [{"message": {"content": '{"h1":"Resultado"}'}}]}).encode())

    monkeypatch.setattr(bl.urllib.request, "urlopen", respond)
    assert bl.chat_json("REGLAS EDITORIALES v1", "brief", "deepseek/deepseek-v4-flash")["h1"] == "Resultado"
    assert payloads[-1]["reasoning"] == {"enabled": False}
    assert payloads[-1]["max_tokens"] == 8000
    bl.chat_json("REGLAS EDITORIALES v1", "brief", "other-model")
    assert "reasoning" not in payloads[-1]
    bl.chat_json("Otro flujo", "brief", "other-model")
    assert "max_tokens" not in payloads[-1]


def test_decision_prompt_includes_required_comparison_in_json_shape(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi", "name": "PC MIDI Center"})
    system, user = bl.generation_prompt({"keyword": "elegir controlador", "cluster_slug": "controladores-midi", "_editorial_brief": {"intent": "decision", "evidence": [], "allowedProductIds": ["minilab-3"]}}, CATEGORIES, PRODUCTS)
    shape = user.split("Genera un artículo JSON con exactamente esta forma:", 1)[1].split("Reglas:", 1)[0]
    assert '"decision_support"' in shape and '"source_ids"' in shape and '"evidence_ids"' in shape
    assert "No menciones precios, stock" not in system
