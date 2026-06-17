from urllib.parse import quote_plus

import feedparser

from authority_swarm.sources.duckduckgo import localize_query


def search_youtube_rss(query: str, limit: int = 10) -> list[dict[str, str]]:
    localized = localize_query(query)
    url = f"https://www.youtube.com/feeds/videos.xml?search_query={quote_plus(localized)}"
    feed = feedparser.parse(url)
    results: list[dict[str, str]] = []
    for entry in feed.entries[:limit]:
        results.append({
            "source": "youtube_rss",
            "platform": "youtube",
            "community": getattr(entry, "author", ""),
            "author": getattr(entry, "author", ""),
            "geo_scope": "argentina_query" if "Argentina" in localized or "Buenos Aires" in localized else "unknown",
            "title": getattr(entry, "title", ""),
            "url": getattr(entry, "link", ""),
            "snippet": getattr(entry, "summary", ""),
            "original_text": getattr(entry, "summary", ""),
            "result_type": "content_page",
        })
    return results
