"""Traducciones del blog: agrupación hreflang entre el original y sus hermanas."""

import sys
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
