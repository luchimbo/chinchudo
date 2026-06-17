from authority_swarm.landing.topics import localized_queries
from authority_swarm.models import LandingResearchItem
from authority_swarm.sources.duckduckgo import search_duckduckgo
from authority_swarm.sources.reddit import search_reddit
from authority_swarm.sources.youtube_rss import search_youtube_rss


def _item_from_result(topic: str, result: dict[str, str]) -> LandingResearchItem:
    snippet = result.get("original_text") or result.get("snippet") or result.get("title") or ""
    return LandingResearchItem(
        topic=topic,
        source=result.get("source", result.get("platform", "web")),
        url=result.get("url", ""),
        platform=result.get("platform", "web"),
        title=result.get("title", ""),
        snippet=snippet[:1200],
        need=snippet[:300],
        intent="commercial_research" if any(term in snippet.lower() for term in ["compr", "precio", "me conviene", "vs", "vale la pena", "cual", "cuál"]) else "educational_research",
        geo_scope=result.get("geo_scope", "unknown"),
    )


def research_landing_topic(topic: str, limit: int = 8) -> list[LandingResearchItem]:
    raw_results: list[dict[str, str]] = []
    per_query = max(1, limit // 3)
    for query in localized_queries(topic)[:3]:
        try:
            raw_results.extend(search_reddit(query, limit=per_query))
        except Exception:
            pass
        try:
            raw_results.extend(search_youtube_rss(query, limit=per_query))
        except Exception:
            pass
        try:
            raw_results.extend(search_duckduckgo(query, limit=per_query))
        except Exception:
            pass

    seen: set[str] = set()
    items: list[LandingResearchItem] = []
    for result in raw_results:
        key = result.get("url") or result.get("title") or result.get("snippet", "")[:80]
        if not key or key in seen:
            continue
        seen.add(key)
        items.append(_item_from_result(topic, result))
        if len(items) >= limit:
            break
    return items
