import httpx

from authority_swarm.config import get_settings


def search_web(query: str, limit: int = 10) -> list[dict[str, str]]:
    settings = get_settings()
    if not settings.serper_api_key:
        return [{"title": query, "url": "", "snippet": "Busqueda manual sin SERPER_API_KEY configurada."}]

    response = httpx.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
        json={"q": query, "num": limit},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    results = []
    for item in data.get("organic", [])[:limit]:
        results.append({
            "platform": "web",
            "community": "",
            "author": "",
            "geo_scope": "unknown",
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "snippet": item.get("snippet", ""),
            "original_text": item.get("snippet", ""),
            "result_type": "search_result",
        })
    return results


def search_sites(query: str, sites: list[str], limit: int = 10) -> list[dict[str, str]]:
    settings = get_settings()
    if not settings.serper_api_key:
        return []

    results: list[dict[str, str]] = []
    per_site = max(1, limit // max(1, len(sites)))
    for site in sites:
        site_query = f"site:{site} {query}"
        for result in search_web(site_query, limit=per_site):
            result["source"] = site
            results.append(result)
            if len(results) >= limit:
                return results
    return results
