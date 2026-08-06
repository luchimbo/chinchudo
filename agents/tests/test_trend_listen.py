import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

AGENTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENTS_DIR))

SPEC = importlib.util.spec_from_file_location("trend_listen", AGENTS_DIR / "trend-listen.py")
trend_listen = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(trend_listen)


class VideoReferenceTests(unittest.TestCase):
    def test_keeps_public_short_video_urls(self):
        self.assertTrue(trend_listen.is_audiovisual_reference({
            "platform": "YOUTUBE",
            "source_url": "https://www.youtube.com/watch?v=abc123",
            "description": "Un video corto que muestra una demostración de producto real.",
        }))
        self.assertTrue(trend_listen.is_audiovisual_reference({
            "platform": "INSTAGRAM",
            "source_url": "https://www.instagram.com/reel/ABC123/",
            "description": "Un Reel público con una estructura clara y grabable.",
        }))

    def test_rejects_search_topics_and_non_video_pages(self):
        self.assertFalse(trend_listen.is_audiovisual_reference({
            "platform": "GOOGLE_TRENDS",
            "source_url": "https://trends.google.com/trending",
            "description": "Tema de búsqueda en Argentina sin referencia audiovisual.",
        }))

    def test_context_signals_are_kept_out_of_the_audiovisual_filter(self):
        context_signal = {
            "platform": "GOOGLE_NEWS",
            "source_url": "https://news.google.com/rss/articles/example",
            "description": "Una noticia reciente que necesita revisiÃ³n editorial antes de usarse.",
        }
        self.assertFalse(trend_listen.is_audiovisual_reference(context_signal))
        self.assertFalse(trend_listen.is_audiovisual_reference({
            "platform": "INSTAGRAM",
            "source_url": "https://www.instagram.com/marca/",
            "description": "Un perfil no alcanza para usarlo como referencia de video.",
        }))

    def test_argentine_media_agenda_marks_each_item_as_editorial_context(self):
        original = trend_listen.get_youtube_videos_direct
        trend_listen.get_youtube_videos_direct = lambda query, limit=1: [{
            "title": "Tema del día",
            "description": "Resumen",
            "url": "https://www.youtube.com/watch?v=abc123",
        }]
        try:
            signals = trend_listen.get_argentine_media_agenda(limit=1)
        finally:
            trend_listen.get_youtube_videos_direct = original

        self.assertEqual(len(signals), 1)
        self.assertEqual(signals[0]["platform"], "ARGENTINE_STREAMING_MEDIA")
        self.assertEqual(signals[0]["metadata"]["radar_kind"], "context")
        self.assertEqual(signals[0]["metadata"]["sensitivity"], "needs_review")

    def test_argentine_press_agenda_keeps_the_publishing_outlet(self):
        original_get = trend_listen.requests.get
        original_parse = trend_listen.feedparser.parse
        trend_listen.requests.get = lambda *args, **kwargs: SimpleNamespace(status_code=200, content=b"feed")
        trend_listen.feedparser.parse = lambda content: SimpleNamespace(entries=[SimpleNamespace(
            title="Titular de prueba",
            link="https://news.google.com/rss/articles/example",
            source=SimpleNamespace(title="Clarín"),
        )])
        try:
            signals = trend_listen.get_argentine_press_agenda(limit=1)
        finally:
            trend_listen.requests.get = original_get
            trend_listen.feedparser.parse = original_parse

        self.assertEqual(signals[0]["platform"], "ARGENTINE_PRESS")
        self.assertEqual(signals[0]["metadata"]["outlet"], "Clarín")

    def test_press_outlet_normalization_accepts_common_spelling_variants(self):
        self.assertEqual(trend_listen.normalize_outlet_name("Página/12"), "pagina 12")
        self.assertEqual(trend_listen.normalize_outlet_name("ÁMBITO Financiero"), "ambito financiero")

    def test_argentina_data_context_is_marked_for_review(self):
        original_get = trend_listen.requests.get
        payloads = [
            [{"fecha": "2026-07-01", "valor": 1.8}],
            {"fecha": "2026-08-04", "valor": 650},
            [{"fecha": "2099-01-01", "nombre": "Feriado de prueba"}],
        ]
        trend_listen.requests.get = lambda *args, **kwargs: SimpleNamespace(status_code=200, json=lambda: payloads.pop(0))
        try:
            signals = trend_listen.get_argentina_data_context()
        finally:
            trend_listen.requests.get = original_get

        self.assertEqual(len(signals), 3)
        self.assertTrue(all(signal["platform"] == "ARGENTINA_DATA" for signal in signals))
        self.assertTrue(all(signal["metadata"]["sensitivity"] == "needs_review" for signal in signals))
        self.assertFalse(trend_listen.is_audiovisual_reference({
            "platform": "REDDIT",
            "source_url": "https://www.reddit.com/r/music/comments/abc",
            "description": "Una discusión escrita sin video ni formato audiovisual.",
        }))


if __name__ == "__main__":
    unittest.main()
