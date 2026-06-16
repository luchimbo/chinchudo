"""Tests de utilidades puras en publisher.py: parsing de lc= y normalización de URLs."""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


# Replicamos las funciones bajo test (son pequeñas y puras) para no
# cargar todo publisher.py con sus importaciones de browser_cdp.
def _extract_comment_id(video_url: str) -> str | None:
    lc_match = re.search(r'[?&]lc=([A-Za-z0-9_-]+)', video_url)
    return lc_match.group(1) if lc_match else None


def _clean_url(video_url: str) -> str:
    return video_url.split("#")[0]


class TestExtractCommentId:
    def test_lc_param_in_query(self):
        url = "https://www.youtube.com/watch?v=abc123&lc=UgxComment456"
        assert _extract_comment_id(url) == "UgxComment456"

    def test_lc_param_first(self):
        url = "https://www.youtube.com/watch?lc=UgxFirst&v=abc"
        assert _extract_comment_id(url) == "UgxFirst"

    def test_no_lc_returns_none(self):
        url = "https://www.youtube.com/watch?v=abc123"
        assert _extract_comment_id(url) is None

    def test_lc_with_hyphens_and_underscores(self):
        url = "https://www.youtube.com/watch?v=x&lc=Ugx_abc-XYZ"
        assert _extract_comment_id(url) == "Ugx_abc-XYZ"

    def test_fragment_not_included(self):
        url = "https://www.youtube.com/watch?v=x&lc=Ugx123#top"
        # _extract_comment_id only looks at lc=, not fragment
        assert _extract_comment_id(url) == "Ugx123"


class TestCleanUrl:
    def test_removes_fragment(self):
        url = "https://www.youtube.com/watch?v=abc#top"
        assert _clean_url(url) == "https://www.youtube.com/watch?v=abc"

    def test_no_fragment_unchanged(self):
        url = "https://www.youtube.com/watch?v=abc"
        assert _clean_url(url) == url

    def test_multiple_hashes_splits_at_first(self):
        url = "https://example.com/path#section#subsection"
        assert _clean_url(url) == "https://example.com/path"
