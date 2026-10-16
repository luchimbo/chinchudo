import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

AGENTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENTS_DIR))

SPEC = importlib.util.spec_from_file_location("reference_accounts", AGENTS_DIR / "reference-accounts.py")
ref = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(ref)


class YouTubeParsingTests(unittest.TestCase):
    def test_reads_old_and_new_shorts_formats(self):
        data = {"contents": [
            {"reelItemRenderer": {"videoId": "a1", "headline": {"simpleText": "Nadie te dice esto del bombo"}, "viewCountText": {"simpleText": "12.345 vistas"}}},
            {"shortsLockupViewModel": {"entityId": "shorts-shelf-item-b2", "overlayMetadata": {"primaryText": {"content": "Pads de goma vs malla"}, "secondaryText": {"content": "1,2 M de vistas"}}}},
            {"reelItemRenderer": {"videoId": "a1", "headline": {"simpleText": "duplicado"}}},
        ]}
        items = ref.parse_youtube_items(data)
        self.assertEqual([i["url"] for i in items], ["https://www.youtube.com/shorts/a1", "https://www.youtube.com/shorts/b2"])
        self.assertEqual([i["views"] for i in items], [12345, 1_200_000])

    def test_falls_back_to_regular_videos(self):
        data = {"x": [{"videoRenderer": {"videoId": "v9", "title": {"runs": [{"text": "Review completa"}]}, "viewCountText": {"simpleText": "980 vistas"}}}]}
        self.assertEqual(ref.parse_youtube_items(data), [{"title": "Review completa", "url": "https://www.youtube.com/watch?v=v9", "views": 980}])


class GridTests(unittest.TestCase):
    def test_grid_dedupes_and_parses_views(self):
        tiles = [{"url": "https://www.instagram.com/reel/A/", "title": "", "viewsText": "15,3 mil"}, {"url": "https://www.instagram.com/reel/A/", "viewsText": "1"}, {"url": "", "viewsText": "3"}]
        self.assertEqual(ref.grid_items(tiles), [{"title": "https://www.instagram.com/reel/A/", "url": "https://www.instagram.com/reel/A/", "views": 15_300}])


class SchedulingTests(unittest.TestCase):
    def test_scans_new_requested_or_stale_accounts(self):
        now = datetime(2026, 10, 17, tzinfo=timezone.utc)
        self.assertTrue(ref.due_for_scan({"lastScannedAt": None}, now))
        self.assertFalse(ref.due_for_scan({"lastScannedAt": now - timedelta(days=2)}, now))
        self.assertTrue(ref.due_for_scan({"lastScannedAt": now - timedelta(days=2), "scanRequestedAt": now - timedelta(days=1)}, now))
        self.assertTrue(ref.due_for_scan({"lastScannedAt": now - timedelta(days=7)}, now))
        self.assertTrue(ref.due_for_scan({"lastScannedAt": now}, now, force=True))


if __name__ == "__main__":
    unittest.main()
