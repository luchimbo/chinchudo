import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from extractors import youtube  # noqa: E402


def card(url: str) -> dict:
    return {"url": url, "title": "Piano", "context": "Piano digital para principiantes"}


def test_chapter_links_do_not_count_as_a_second_video():
    videos = youtube.unique_videos([
        card("https://www.youtube.com/watch?v=gW_psCYIY68&pp=abc"),
        card("https://www.youtube.com/watch?v=gW_psCYIY68&t=30s&pp=def"),
        card("https://www.youtube.com/watch?v=other123&pp=x"),
    ])
    assert [video["url"] for video in videos] == ["https://www.youtube.com/watch?v=gW_psCYIY68", "https://www.youtube.com/watch?v=other123"]


def test_waits_until_late_search_results_render(monkeypatch):
    # Live NSTBrowser profile: results appeared after ~9 polls; the old fixed 3s sleep returned none.
    reads = iter([[]] * 8 + [[card("https://www.youtube.com/watch?v=a1"), card("https://www.youtube.com/watch?v=a1&t=30s"), card("https://www.youtube.com/watch?v=b2")]])
    monkeypatch.setattr(youtube, "extract_visible_items", lambda client, channel, limit: next(reads))
    monkeypatch.setattr(youtube.time, "sleep", lambda seconds: None)
    assert [v["url"][-2:] for v in youtube.wait_for_search_videos(object(), 2, timeout=60)] == ["a1", "b2"]


def test_gives_up_with_what_it_has_after_the_timeout(monkeypatch):
    clock = iter(range(0, 100, 5))
    monkeypatch.setattr(youtube.time, "monotonic", lambda: next(clock))
    monkeypatch.setattr(youtube.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(youtube, "extract_visible_items", lambda client, channel, limit: [card("https://www.youtube.com/watch?v=only")])
    assert len(youtube.wait_for_search_videos(object(), 2, timeout=15)) == 1


class FakeClient:
    def __init__(self):
        self.urls = []

    def send(self, method, params=None):
        if method == "Page.navigate":
            self.urls.append(params["url"])
        return {}


def test_recent_search_reads_six_videos_and_spreads_the_comment_budget(monkeypatch):
    client = FakeClient()
    videos = [card(f"https://www.youtube.com/watch?v=vid{i}") for i in range(6)]
    monkeypatch.setattr(youtube, "wait_for_search_videos", lambda c, wanted: videos[:wanted])
    monkeypatch.setattr(youtube.time, "sleep", lambda seconds: None)
    budgets = []

    def fake_evaluate(c, expression, await_promise=False):
        if "maxItems" not in expression:
            return None
        budgets.append(int(expression.split("const maxItems = ")[1].split(";")[0]))
        assert "const maxPages = 3;" in expression
        video = client.urls[-1].split("v=")[1]
        return [{"url": f"https://www.youtube.com/watch?v={video}&lc=Ugx{video}{n}", "context": "¿Qué piano digital recomiendan?"} for n in range(min(25, budgets[-1]))]

    monkeypatch.setattr(youtube, "evaluate", fake_evaluate)
    items = youtube.extract_youtube_comment_items(client, "piano digital", 120, videos_limit=6, search_mode="popular", comment_pages=3)
    assert client.urls[0].endswith("&sp=" + youtube.SEARCH_FILTERS["popular"])
    assert len(client.urls) == 7 and budgets == [20] * 6
    assert len(items) == 120 and len({item["url"].split("&lc=")[0] for item in items}) == 6


def test_search_results_come_from_initial_data_when_cards_do_not_render(monkeypatch):
    monkeypatch.setattr(youtube.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(youtube, "extract_visible_items", lambda client, channel, limit: [])
    monkeypatch.setattr(youtube, "evaluate", lambda client, expression, await_promise=False: [card("https://www.youtube.com/watch?v=data1"), card("https://www.youtube.com/watch?v=data2")] if "twoColumnSearchResultsRenderer" in expression else None)
    assert [v["url"][-5:] for v in youtube.wait_for_search_videos(object(), 2)] == ["data1", "data2"]
