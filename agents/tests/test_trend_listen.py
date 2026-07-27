import importlib.util
import sys
import unittest
from pathlib import Path

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
        self.assertFalse(trend_listen.is_audiovisual_reference({
            "platform": "INSTAGRAM",
            "source_url": "https://www.instagram.com/marca/",
            "description": "Un perfil no alcanza para usarlo como referencia de video.",
        }))
        self.assertFalse(trend_listen.is_audiovisual_reference({
            "platform": "REDDIT",
            "source_url": "https://www.reddit.com/r/music/comments/abc",
            "description": "Una discusión escrita sin video ni formato audiovisual.",
        }))


if __name__ == "__main__":
    unittest.main()
