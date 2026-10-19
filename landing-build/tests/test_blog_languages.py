import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_landings as bl
from blog_languages import localize_html
from test_editorial_blog import article, CATEGORIES, PRODUCTS, BODY, STORE


def test_same_generator_accepts_language_for_any_brand(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"name": "Any Brand", "slug": "any-brand"})
    monkeypatch.setattr(bl, "_GENERATION_LANGUAGE", "de")
    system, user = bl.generation_prompt({"keyword": "home music", "cluster_slug": "music"}, CATEGORIES, PRODUCTS)
    assert "Write ALL public text in idiomatisches Deutsch" in system
    assert "Usa español rioplatense" not in system
    assert "OUTPUT LANGUAGE: de" in user
    result = bl.normalize_generated_landing({"keyword": "Klavier üben"})
    assert result["language"] == "de"
    assert bl.editorial_pillar_topics([{"slug": "music", "name": "Piano"}], [])[0]["keyword"] == "Ratgeber: piano"
    assert bl.normalize_generated_landing({"keyword": "English practice", "language": "en"})["language"] == "en"


def test_language_routes_preserve_existing_spanish_urls():
    data = {"slug": "practice", "content_type": "GUIDE", "cluster_slug": "music", "indexing_state": "INDEX"}
    assert bl.landing_path(data) == "/guias/music/practice/"
    assert bl.landing_path({**data, "language": "en"}) == "/en/guias/music/practice/"
    assert bl.landing_path({**data, "language": "de"}) == "/de/guias/music/practice/"


def test_localization_preserves_revision_markers_and_scripts():
    document = '<!doctype html><html lang="es-AR"><head><meta name="editorial-revision" content="abc"><script>const text="Ver tienda";</script></head><body><a href="/guias/music/">Ver tienda</a><h2>Respuesta rápida</h2></body></html>'
    rendered = localize_html(document, "de")
    assert '<html lang="de">' in rendered
    assert 'href="/de/guias/music/"' in rendered
    assert "Instrumente entdecken" in rendered
    assert 'const text="Ver tienda"' in rendered
    assert '<meta name="editorial-revision" content="abc">' in rendered


def test_shared_builder_separates_language_pages_and_sitemap(tmp_path, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"name": "Any Brand", "slug": "any-brand", "storeUrl": STORE, "responsePolicy": {"blog": {"language": "en", "languages": ["en", "de"]}}})
    monkeypatch.setattr(bl, "SITE_DIR", tmp_path / "site")
    monkeypatch.setattr(bl, "ASSETS_DIR", tmp_path / "site/assets")
    monkeypatch.setattr(bl, "REPORTS_DIR", tmp_path / "reports")
    monkeypatch.setattr(bl, "load_categories", lambda: CATEGORIES)
    monkeypatch.setattr(bl, "load_products", lambda: PRODUCTS)
    monkeypatch.setattr(bl, "load_lead_magnets", lambda: {})
    monkeypatch.setattr(bl, "load_content_clusters", lambda: [{"slug": "music", "name": "Music", "description": ""}])
    rows = [article("home-practice", "music", language="en", **BODY), article("klavier-ueben", "music", language="de", **BODY)]
    monkeypatch.setattr(bl, "load_landings", lambda: rows)
    bl.build("https://blog.example")
    site = tmp_path / "site"
    assert (site / "en/guias/music/home-practice/index.html").exists()
    assert (site / "de/guias/music/klavier-ueben/index.html").exists()
    en = (site / "en/index.html").read_text(encoding="utf-8")
    assert "/en/guias/music/home-practice/" in en
    assert "klavier-ueben" not in en
    assert '<html lang="de">' in (site / "de/index.html").read_text(encoding="utf-8")
    sitemap = (site / "sitemap.xml").read_text(encoding="utf-8")
    assert "https://blog.example/de/guias/music/klavier-ueben/" in sitemap
    assert "<loc>https://blog.example/</loc>" not in sitemap
