from ddgs import DDGS


ARGENTINA_TERMS = "Argentina OR argentino OR CABA OR Buenos Aires"


def localize_query(query: str) -> str:
    query_lower = query.lower()
    if any(term in query_lower for term in ["argentina", "argentino", "buenos aires", "caba"]):
        return query
    return f"{query} {ARGENTINA_TERMS}"


def classify_result(title: str, url: str, body: str) -> str:
    text = f"{title} {url} {body}".lower()
    if any(marker in text for marker in ["preguntas frecuentes", "faq", "carrito", "mercadolibre", "tienda", "envio", "stock"]):
        return "commercial_page"
    if any(marker in text for marker in ["reddit.com/r/", "foro", "forum", "pregunta", "consulta", "problema", "ayuda"]):
        return "conversation_or_question"
    if any(marker in text for marker in ["compr", "precio", "categoria"]):
        return "commercial_page"
    return "content_page"


def search_duckduckgo(query: str, limit: int = 10, site: str | None = None) -> list[dict[str, str]]:
    localized = localize_query(query)
    search_query = f"site:{site} {localized}" if site else localized
    results: list[dict[str, str]] = []
    with DDGS() as ddgs:
        for item in ddgs.text(search_query, region="ar-es", safesearch="moderate", max_results=limit):
            title = item.get("title", "")
            url = item.get("href", "")
            body = item.get("body", "")
            results.append({
                "source": site or "duckduckgo",
                "platform": site or "web",
                "community": site or "",
                "author": "",
                "geo_scope": "argentina_indexed" if any(term in search_query.lower() for term in ["argentina", "buenos aires", "caba"]) else "unknown",
                "title": title,
                "url": url,
                "snippet": body,
                "original_text": body,
                "result_type": classify_result(title, url, body),
            })
    return results


def search_duckduckgo_sites(query: str, sites: list[str], limit: int = 10) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    per_site = max(1, limit // max(1, len(sites)))
    for site in sites:
        results.extend(search_duckduckgo(query, limit=per_site, site=site))
        if len(results) >= limit:
            break
    return results[:limit]
