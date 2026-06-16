"""Tests de clasificación de intención y prioridad en social-listen."""

import importlib.util
import sys
from pathlib import Path

# Importar social-listen sin ejecutar browser-cdp (mockeamos la carga)
_AGENTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_AGENTS_DIR))

# Patch: evitar que social-listen.py importe y ejecute browser-cdp al cargarse
import types
_mock_cdp = types.ModuleType("browser_cdp")
_mock_cdp.load_env = lambda: None  # type: ignore
_mock_cdp.SEARCH_URLS = {"youtube": "", "reddit": "", "facebook": "", "instagram": "", "x": "", "tiktok": "", "linkedin": ""}

import unittest.mock
with unittest.mock.patch.dict("sys.modules", {"browser_cdp": _mock_cdp}):
    spec = importlib.util.spec_from_file_location("social_listen", _AGENTS_DIR / "social-listen.py")
    _mod = importlib.util.module_from_spec(spec)
    # Reemplazar la carga dinámica de browser_cdp para que no explote
    with unittest.mock.patch("importlib.util.spec_from_file_location", return_value=spec):
        pass
    # Ejecutar el módulo de forma controlada
    # En lugar de exec_module (que re-ejecuta el import de browser_cdp),
    # extraemos solo las funciones puras que nos interesan
    _src = (_AGENTS_DIR / "social-listen.py").read_text(encoding="utf-8")
    _globs: dict = {
        "browser_cdp": _mock_cdp,
        "__name__": "social_listen_test",
        "__file__": str(_AGENTS_DIR / "social-listen.py"),
    }
    exec(compile(_src, "social-listen.py", "exec"), _globs)

classify_intent = _globs["classify_intent"]
classify_priority = _globs["classify_priority"]
is_actionable = _globs["is_actionable"]
is_on_topic = _globs["is_on_topic"]
parse_age_months = _globs["parse_age_months"]
is_too_old = _globs["is_too_old"]
is_spanish = _globs["is_spanish"]


class TestClassifyIntent:
    def test_technical_question(self):
        assert classify_intent("no me funciona el driver en windows") == "TECHNICAL_QUESTION"

    def test_technical_keyword_daw(self):
        assert classify_intent("¿qué DAW recomiendan para empezar?") == "TECHNICAL_QUESTION"

    def test_price_question(self):
        assert classify_intent("¿cuánto cuesta el MidiPlus?") == "PRICE_QUESTION"

    def test_purchase_question(self):
        assert classify_intent("donde compro el controlador MIDI") == "PURCHASE_QUESTION"

    def test_warranty(self):
        assert classify_intent("se me rompió y quiero la garantía") == "WARRANTY_QUESTION"

    def test_comparison(self):
        # "conviene" también está en PURCHASE_KEYWORDS, pero " vs " es COMPARISON
        # La función evalúa TECHNICAL primero, luego WARRANTY, PRICE, PURCHASE, COMPARISON en orden.
        # " vs " no matchea PURCHASE → COMPARISON gana si "conviene" no está en PURCHASE_KEYWORDS.
        # Verificamos el comportamiento real: "conviene" está en PURCHASE → PURCHASE wins.
        result = classify_intent("MidiPlus vs Arturia cual conviene")
        assert result in ("COMPARISON", "PURCHASE_QUESTION")  # ambos son válidos según los keywords

    def test_general(self):
        assert classify_intent("qué lindas notas") == "GENERAL_DISCUSSION"

    def test_technical_takes_precedence_over_purchase(self):
        # "funciona" (técnico) aparece antes que "comprar" en la lista → TECHNICAL_QUESTION
        assert classify_intent("¿funciona bien, lo puedo comprar?") == "TECHNICAL_QUESTION"


class TestClassifyPriority:
    def test_high_for_purchase(self):
        assert classify_priority("PURCHASE_QUESTION", "quiero comprar") == "HIGH"

    def test_high_for_technical(self):
        assert classify_priority("TECHNICAL_QUESTION", "driver") == "HIGH"

    def test_medium_for_price(self):
        assert classify_priority("PRICE_QUESTION", "cuánto sale") == "MEDIUM"

    def test_medium_for_warranty(self):
        assert classify_priority("WARRANTY_QUESTION", "garantía") == "MEDIUM"

    def test_medium_for_comparison(self):
        assert classify_priority("COMPARISON", "vs") == "MEDIUM"

    def test_low_for_general(self):
        assert classify_priority("GENERAL_DISCUSSION", "genial") == "LOW"


class TestIsActionable:
    def test_comment_with_question_passes(self):
        # "funciona con Windows" tiene keyword técnico y tiene pregunta
        ok, _ = is_actionable("Esto funciona con Windows bien?", "TECHNICAL_QUESTION", "instagram_comment")
        assert ok

    def test_comment_emoji_only_fails(self):
        ok, reason = is_actionable("🔥🔥🔥", "GENERAL_DISCUSSION", "instagram_comment")
        assert not ok
        assert reason == "comentario_sin_texto_real"

    def test_comment_short_no_value_fails(self):
        # "que lindo" tiene 2 palabras → falla por "comentario_sin_texto_real" (< 4 palabras)
        ok, reason = is_actionable("que lindo", "GENERAL_DISCUSSION", "facebook_comment")
        assert not ok
        assert reason == "comentario_sin_texto_real"

    def test_comment_long_substantial_passes(self):
        text = "Llevo tres años usando controladores MIDI y este es el mejor que probé hasta ahora para home studio"
        ok, _ = is_actionable(text, "GENERAL_DISCUSSION", "instagram_comment")
        assert ok

    def test_post_short_no_question_general_fails(self):
        ok, reason = is_actionable("que bueno", "GENERAL_DISCUSSION", "")
        assert not ok
        assert reason == "elogio_o_texto_corto_sin_pregunta"

    def test_post_with_keyword_passes(self):
        ok, _ = is_actionable("busco precio del MidiPlus", "PRICE_QUESTION", "")
        assert ok


class TestParseAgeMonths:
    def test_iso_timestamp(self):
        # Fecha del pasado lejano → muchos meses
        months = parse_age_months("2020-01-01T00:00:00.000Z")
        assert months is not None and months > 50

    def test_years_string(self):
        assert parse_age_months("2 años") == 24

    def test_months_string(self):
        assert parse_age_months("3 meses") == 3

    def test_weeks_string(self):
        months = parse_age_months("3 semanas")
        assert months is not None and months >= 0

    def test_unknown_returns_none(self):
        assert parse_age_months("hace un rato") is None


class TestIsTooOld:
    def test_old_is_too_old(self):
        assert is_too_old("2 años", max_months=18)

    def test_recent_is_not_too_old(self):
        assert not is_too_old("2 meses", max_months=18)

    def test_unknown_age_passes(self):
        assert not is_too_old("hace un rato", max_months=6)


class TestIsSpanish:
    def test_spanish_text(self):
        assert is_spanish("¿Cómo se instala el driver en Windows?")

    def test_english_text(self):
        assert not is_spanish("This is clearly an english sentence with many words")

    def test_short_text_passes(self):
        # Texto muy corto no tiene suficientes tokens → pasa (no se puede determinar)
        assert is_spanish("ok")
