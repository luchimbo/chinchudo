import importlib.util
from pathlib import Path


def load_social_listen():
    path = Path(__file__).resolve().parents[1] / "social-listen.py"
    spec = importlib.util.spec_from_file_location("social_listen", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


social_listen = load_social_listen()


def test_language_filter_accepts_spanish():
    ok, detected = social_listen.language_allowed("Tengo una duda con este controlador MIDI", "es")
    assert ok is True
    assert detected == "es"


def test_language_filter_rejects_english_when_spanish_requested():
    ok, detected = social_listen.language_allowed("How do I configure this MIDI controller on Mac?", "es")
    assert ok is False
    assert detected == "en"


def test_language_filter_accepts_portuguese():
    ok, detected = social_listen.language_allowed("Não consigo configurar este teclado MIDI", "pt")
    assert ok is True
    assert detected == "pt"


def test_language_filter_any_accepts_detected_language():
    ok, detected = social_listen.language_allowed("How much does this audio interface cost?", "any")
    assert ok is True
    assert detected == "en"


def test_language_filter_accepts_german():
    ok, detected = social_listen.language_allowed("Welches Digitalpiano kann ich für Anfänger kaufen?", "de")
    assert ok is True
    assert detected == "de"


def test_german_is_not_accepted_as_spanish():
    ok, detected = social_listen.language_allowed("Ich suche ein Digitalpiano mit Kopfhörer", "es")
    assert ok is False
    assert detected == "de"
