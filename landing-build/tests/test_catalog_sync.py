import importlib.util
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("catalog_builder", ROOT / "build_landings.py")
bl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bl)


def test_missing_markers_keep_names_and_labels():
    products = {"p": {"id": "p", "nombre": "Modelo conservado", "marca": "Marca", "url": "https://store.example/old/", "linkStatus": "missing"}}
    categories = {"c": {"id": "c", "nombre": "Categoría", "url": "https://store.example/c/", "linkStatus": "missing"}}
    linker = bl.ArticleLinker({}, categories, products)
    assert linker.marker("p", "p", "Texto original") == "Texto original"
    assert linker.marker("c", "c", None) == "Categoría"
    assert "<a" not in linker.mentions("Modelo conservado")


def test_catalog_sources_follow_live_url_without_mutating_evidence():
    source = {"id": "catalog-p", "type": "catalog", "url": "https://store.example/old/", "claims": ["Dato revisado"]}
    independent = {"id": "external", "type": "manufacturer", "url": "https://manufacturer.example/source"}
    product = {"id": "p", "nombre": "Modelo", "url": "https://store.example/new/"}
    linker = bl.ArticleLinker({"source_refs": [source, independent]}, {}, {"p": product})
    assert linker.sources["catalog-p"][1]["url"] == product["url"]
    assert linker.sources["external"][1]["url"] == independent["url"]
    assert source["url"].endswith("old/")
    assert linker.sources["catalog-p"][1]["claims"] == ["Dato revisado"]
    product["linkStatus"] = "missing"
    assert bl.ArticleLinker({"source_refs": [source]}, {}, {"p": product}).sources["catalog-p"][1]["url"] == ""


def test_cards_and_legacy_links_lose_only_the_retired_destination(monkeypatch):
    monkeypatch.setenv("LANDING_CATALOG_VERSION", "run-123")
    products = {"p": {"url": "https://store.example/old/", "linkStatus": "missing"}}
    value = '<head></head><a class="product-pill" href="https://store.example/old/"><span>Modelo</span></a><a href="https://store.example/new/">Otro</a>'
    result = bl.catalog_html(value, {}, products)
    assert '<span>Modelo</span>' in result
    assert 'href="https://store.example/old/"' not in result
    assert 'href="https://store.example/new/"' in result
    assert 'catalog-sync-version" content="run-123' in result


def test_software_is_not_eligible_for_hardware_articles(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "pcmidi"})
    products = {"a": {"nombre": "Interfaz", "editorialEligible": True}, "b": {"nombre": "Cubase", "editorialEligible": False}, "c": {"nombre": "Otro", "linkStatus": "missing"}}
    assert list(bl.eligible_catalog_products(products)) == ["a"]
    assert list(bl.eligible_catalog_products(products, include_inactive=True)) == ["a", "c"]
