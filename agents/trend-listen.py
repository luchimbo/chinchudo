#!/usr/bin/env python3
"""Radar de videos y formatos para Los 5 Apostoles.

Recolecta solamente referencias audiovisuales publicas de TikTok, Instagram y
YouTube. Es solo lectura: no publica, no comenta ni interactua con redes.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path

import feedparser
import requests

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from _log import get_logger
from db_pg import connect

log = get_logger("trend-listen")
INTAKE_PATH = ROOT / "data" / "trends-intake.jsonl"
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}
MAX_KEYWORDS_PER_SOURCE = int(os.environ.get("TRENDS_KEYWORDS_PER_SOURCE", "8"))


def is_audiovisual_reference(trend: dict) -> bool:
    """Acepta solo videos, hashtags de TikTok Creative Center y formatos con URL real."""
    platform = (trend.get("platform") or "").upper()
    source_url = (trend.get("source_url") or "").strip()
    description = (trend.get("description") or "").strip()
    if not source_url.startswith(("https://", "http://")) or len(description) < 20:
        return False

    parsed = urllib.parse.urlparse(source_url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if platform == "TIKTOK_CREATIVE_CENTER":
        return host.endswith("tiktok.com") and path.startswith("/tag/")
    if platform in {"TIKTOK", "TIKTOK_HASHTAG"}:
        return host.endswith("tiktok.com") and ("/@" in path or path.startswith("/tag/"))
    if platform == "INSTAGRAM":
        return host.endswith("instagram.com") and "/reel/" in path
    if platform == "YOUTUBE":
        return host.endswith("youtube.com") and (path == "/watch" or path.startswith("/shorts/"))
    if platform == "VIRAL_MARKETING":
        return (host.endswith("tiktok.com") or host.endswith("instagram.com") or host.endswith("youtube.com"))
    return False


def load_client_keywords() -> list[dict]:
    clients_data = []
    with connect() as conn:
        rows = conn.execute('SELECT id, name, slug, description, "domainKeywords", "domainExclusions" FROM "Client" WHERE active = true').fetchall()
        for row in rows:
            try:
                keywords = json.loads(row["domainKeywords"] or "[]")
            except Exception:
                keywords = []

            brands = conn.execute('SELECT name FROM "Brand" WHERE "clientId" = %s', (row["id"],)).fetchall()
            brand_names = [brand["name"].lower() for brand in brands]
            rules = conn.execute('SELECT category, keywords FROM "CatalogRule" WHERE "clientId" = %s', (row["id"],)).fetchall()
            rule_keywords = []
            for rule in rules:
                rule_keywords.append(rule["category"])
                try:
                    rule_keywords.extend(json.loads(rule["keywords"] or "[]"))
                except Exception:
                    pass
            products = conn.execute('SELECT name, category, "useCases" FROM "Product" WHERE "brandId" IN (SELECT id FROM "Brand" WHERE "clientId" = %s)', (row["id"],)).fetchall()
            product_terms = []
            for product in products:
                product_terms.extend([product["name"], product["category"]])
                product_terms.extend(re.split(r"[,;/|]", product["useCases"] or ""))
            try:
                exclusions = {str(item).lower() for item in json.loads(row["domainExclusions"] or "[]") if item}
            except Exception:
                exclusions = set()
            merged = [term for term in dict.fromkeys(
                [str(term).strip().lower() for term in [*rule_keywords, *product_terms, *keywords, *brand_names] if str(term).strip()]
            ) if term not in exclusions]

            clients_data.append({
                "id": row["id"],
                "name": row["name"],
                "slug": row["slug"],
                "description": row["description"],
                "keywords": merged,
            })
    return clients_data


def keyword_match(text: str, keywords: list[str]) -> str:
    lowered = text.lower()
    for keyword in keywords:
        if not keyword:
            continue
        if re.search(r"\b" + re.escape(keyword) + r"\b", lowered):
            return keyword
        if len(keyword) > 4 and keyword in lowered:
            return keyword
    return ""


def trend_key(trend: dict) -> str:
    source_url = (trend.get("source_url") or "").strip()
    client_id = trend.get("clientId") or ""
    if source_url:
        return f"{client_id}::url::{source_url}"
    return f"{client_id}::fallback::{trend.get('platform', '')}::{trend.get('title', '')}"


def load_existing_trend_keys() -> set[str]:
    keys = set()
    with connect() as conn:
        rows = conn.execute('SELECT "clientId", "sourceUrl", platform, title FROM "Trend"').fetchall()
        for row in rows:
            client_id = row["clientId"] or ""
            source_url = (row["sourceUrl"] or "").strip()
            if source_url:
                keys.add(f"{client_id}::url::{source_url}")
            else:
                keys.add(f"{client_id}::fallback::{row['platform'] or ''}::{row['title'] or ''}")
    return keys


def get_google_trends_ar(keywords: list[str]) -> list[dict]:
    log.info("google_trends_start", details="Google Trends RSS AR")
    trends = []
    try:
        response = requests.get("https://trends.google.com/trending/rss?geo=AR", headers=DEFAULT_HEADERS, timeout=15)
        if response.status_code != 200:
            log.warning("google_trends_http", status=response.status_code)
            return []

        feed = feedparser.parse(response.content)
        for entry in feed.entries:
            title = getattr(entry, "title", "")
            desc = getattr(entry, "description", "")
            traffic = getattr(entry, "ht_approx_traffic", "N/A")
            matched = keyword_match(f"{title} {desc}", keywords)
            if not matched:
                continue
            trends.append({
                "title": f"Google Trend: {title}",
                "description": f"Tendencia en Google Argentina con {traffic} busquedas aproximadas. Relacionado con: {matched}. {desc}",
                "source_url": getattr(entry, "link", ""),
                "platform": "GOOGLE_TRENDS",
                "query_used": matched,
                "metadata": {
                    "source": "google_trends_rss",
                    "country": "AR",
                    "approx_traffic": traffic,
                    "published": getattr(entry, "published", ""),
                },
            })
    except Exception as exc:
        log.error("google_trends_failed", error=str(exc))
    log.info("google_trends_done", found=len(trends))
    return trends


def get_twitter_trends_ar(keywords: list[str]) -> list[dict]:
    log.info("twitter_trends_start", details="Trends24 Argentina")
    trends = []
    try:
        response = requests.get("https://trends24.in/argentina/", headers=DEFAULT_HEADERS, timeout=15)
        if response.status_code != 200:
            log.warning("twitter_trends_http", status=response.status_code)
            return []

        matches = re.findall(r'href="/search\?q=([^"]+)"[^>]*>([^<]+)</a>', response.text)
        unique_tags = {}
        for query_encoded, name in matches:
            clean = name.strip()
            if clean and clean not in unique_tags:
                unique_tags[clean] = urllib.parse.unquote(query_encoded)

        for name, query in unique_tags.items():
            matched = keyword_match(name, keywords)
            if not matched:
                continue
            trends.append({
                "title": f"X/Twitter Trend: {name}",
                "description": f"Tema caliente en X/Twitter Argentina detectado por Trends24. Termino relacionado: {matched}.",
                "source_url": f"https://x.com/search?q={urllib.parse.quote(name)}",
                "platform": "TWITTER",
                "query_used": matched,
                "metadata": {"source": "trends24", "trend_query": query, "country": "AR"},
            })
    except Exception as exc:
        log.error("twitter_trends_failed", error=str(exc))
    log.info("twitter_trends_done", found=len(trends))
    return trends


def get_youtube_videos_direct(query: str, limit: int = 3) -> list[dict]:
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
    videos = []
    try:
        response = requests.get(url, headers=DEFAULT_HEADERS, timeout=12)
        if response.status_code != 200:
            return []

        match = re.search(r"ytInitialData\s*=\s*(\{.+?\});", response.text)
        if not match:
            match = re.search(r"var ytInitialData\s*=\s*(\{.+?\});", response.text)
        if not match:
            return []

        data = json.loads(match.group(1))
        contents = data["contents"]["twoColumnSearchResultsRenderer"]["primaryContents"]["sectionListRenderer"]["contents"]
        for section in contents:
            for item in section.get("itemSectionRenderer", {}).get("contents", []):
                renderer = item.get("videoRenderer")
                if not renderer:
                    continue
                video_id = renderer.get("videoId")
                title = renderer.get("title", {}).get("runs", [{}])[0].get("text", "")
                desc = "".join(part.get("text", "") for part in renderer.get("descriptionSnippet", {}).get("runs", []))
                if video_id and title:
                    videos.append({
                        "title": title,
                        "description": desc,
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    })
                if len(videos) >= limit:
                    return videos
    except Exception as exc:
        log.warning("youtube_search_failed", query=query, error=str(exc))
    return videos


def get_youtube_trends(keywords: list[str]) -> list[dict]:
    log.info("youtube_trends_start", details="YouTube/Shorts search")
    trends = []
    for keyword in keywords[:MAX_KEYWORDS_PER_SOURCE]:
        if len(keyword) < 3:
            continue
        for video in get_youtube_videos_direct(f"{keyword} argentina shorts", limit=1):
            trends.append({
                "title": f"YouTube/Shorts: {video['title']}",
                "description": f"Referencia de video sobre {keyword} en Argentina. Usar como inspiracion editorial, no como fuente de claims: {video['description']}",
                "source_url": video["url"],
                "platform": "YOUTUBE",
                "query_used": keyword,
                "metadata": {"source": "youtube_html_search", "format_hint": "Short"},
            })
    log.info("youtube_trends_done", found=len(trends))
    return trends


def get_tiktok_creative_center_trends(keywords: list[str], limit: int = 6) -> list[dict]:
    log.info("tiktok_creative_center_start", details="TikTok Creative Center AR")
    trends = []
    endpoint = "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list"
    params = {
        "page": 1,
        "limit": min(50, max(limit, 10)),
        "period": 7,
        "country_code": "AR",
        "industry_id": "",
        "filter_by": "",
        "keyword": "",
        "sort_by": "popular",
    }
    headers = {
        **DEFAULT_HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en",
        "Origin": "https://ads.tiktok.com",
    }

    try:
        response = requests.get(endpoint, params=params, headers=headers, timeout=10)
        if response.status_code != 200:
            log.warning("tiktok_creative_center_http", status=response.status_code)
            return []
        payload = response.json()
    except Exception as exc:
        log.warning("tiktok_creative_center_failed", error=str(exc))
        return []

    code = payload.get("code") if isinstance(payload, dict) else None
    if code not in {0, "0", None}:
        log.info(
            "tiktok_creative_center_unavailable",
            code=code,
            reason=payload.get("msg", "") if isinstance(payload, dict) else "",
            fallback="duckduckgo_site_search",
        )
        return []

    data = payload.get("data") if isinstance(payload, dict) else None
    rows = []
    if isinstance(data, dict):
        rows = data.get("list") or data.get("items") or data.get("records") or []
    elif isinstance(data, list):
        rows = data

    for row in rows:
        if len(trends) >= limit:
            break
        if not isinstance(row, dict):
            continue
        title = row.get("hashtag_name") or row.get("keyword") or row.get("title") or row.get("name")
        if not title:
            continue
        matched = keyword_match(json.dumps(row, ensure_ascii=False), keywords)
        if not matched:
            continue
        trends.append({
            "title": f"TikTok Creative Center: #{str(title).lstrip('#')}",
            "description": "Hashtag detectado en TikTok Creative Center para Argentina. Revisar fuente y adaptar al catalogo antes de publicar.",
            "source_url": f"https://www.tiktok.com/tag/{urllib.parse.quote(str(title).lstrip('#'))}",
            "platform": "TIKTOK_CREATIVE_CENTER",
            "query_used": matched,
            "metadata": {
                "source": "tiktok_creative_center_hashtag_api",
                "country": "AR",
                "raw": row,
            },
        })
    log.info("tiktok_creative_center_done", found=len(trends))
    return trends[:limit]


def search_with_duckduckgo(query: str, max_results: int = 1) -> list[dict]:
    try:
        from ddgs import DDGS
    except Exception:
        try:
            from duckduckgo_search import DDGS
        except Exception as exc:
            log.warning("duckduckgo_unavailable", error=str(exc))
            return []

    try:
        with DDGS(timeout=8) as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        log.warning("duckduckgo_search_failed", query=query, error=str(exc))
        return []


def get_tiktok_public_search_trends(keywords: list[str]) -> list[dict]:
    log.info("tiktok_public_search_start", details="TikTok public search fallback")
    trends = []
    for keyword in keywords[:MAX_KEYWORDS_PER_SOURCE]:
        if len(keyword) < 3:
            continue
        queries = [
            f'{keyword} argentina site:tiktok.com/@ "TikTok"',
            f'{keyword} argentina site:tiktok.com/tag',
        ]
        for query in queries:
            for result in search_with_duckduckgo(query, max_results=3):
                href = result.get("href", "")
                if not href or "tiktok.com" not in href:
                    continue
                if any(item.get("source_url") == href for item in trends):
                    continue
                title = result.get("title", "").strip()
                body = result.get("body", "").strip()
                if not title:
                    continue
                if title.lower() in {"tiktok", "tiktok - make your day"}:
                    continue
                haystack = f"{title} {body} {href}".lower()
                keyword_tokens = [token for token in re.split(r"\W+", keyword.lower()) if len(token) >= 3]
                if keyword_tokens and not any(token in haystack for token in keyword_tokens):
                    continue
                source = "duckduckgo_tiktok_tag_search" if "/tag/" in href else "duckduckgo_tiktok_public_search"
                platform = "TIKTOK_HASHTAG" if "/tag/" in href else "TIKTOK"
                description = f"Referencia publica de TikTok sobre {keyword} en Argentina: {body}"
                if "/tag/" in href:
                    description = f"Hashtag publico de TikTok relacionado con {keyword}. Revisar volumen y contexto antes de usarlo."
                trends.append({
                    "title": f"TikTok: {title}",
                    "description": description,
                    "source_url": href,
                    "platform": platform,
                    "query_used": keyword,
                    "metadata": {"source": source, "search_query": query},
                })
                break
            if any(item.get("query_used") == keyword for item in trends):
                break
    log.info("tiktok_public_search_done", found=len(trends))
    return trends


def get_instagram_public_search_trends(keywords: list[str]) -> list[dict]:
    log.info("instagram_public_search_start", details="Instagram/Reels public fallback")
    trends = []
    for keyword in keywords[:MAX_KEYWORDS_PER_SOURCE]:
        if len(keyword) < 3:
            continue
        query = f"{keyword} argentina reels site:instagram.com/reel OR site:instagram.com/p"
        for result in search_with_duckduckgo(query, max_results=1):
            trends.append({
                "title": f"Instagram/Reels: {result.get('title', '')}",
                "description": f"Referencia publica de Instagram sobre {keyword}. Para captions/comentarios completos usar navegador logueado autorizado: {result.get('body', '')}",
                "source_url": result.get("href", ""),
                "platform": "INSTAGRAM",
                "query_used": keyword,
                "metadata": {
                    "source": "duckduckgo_site_search",
                    "requires_logged_browser_for_deep_scan": True,
                },
            })
    log.info("instagram_public_search_done", found=len(trends))
    return trends


def get_reddit_trends(keywords: list[str]) -> list[dict]:
    log.info("reddit_trends_start", details="Reddit public search")
    trends = []
    for keyword in keywords[:MAX_KEYWORDS_PER_SOURCE]:
        if len(keyword) < 3:
            continue
        query = f"{keyword} site:reddit.com"
        for result in search_with_duckduckgo(query, max_results=2):
            href = result.get("href", "")
            if not href or "reddit.com" not in href:
                continue
            if any(item.get("source_url") == href for item in trends):
                continue
            title = result.get("title", "").strip()
            body = result.get("body", "").strip()

            # Beautify title from URL slug if it is placeholder or missing
            if not title or title.lower() == "link to reddit.com" or "reddit" in title.lower():
                match = re.search(r"/comments/[^/]+/([^/]+)", href)
                if match:
                    slug = match.group(1)
                    title = slug.replace("_", " ").replace("-", " ").capitalize()
                else:
                    title = f"Post sobre {keyword}"

            if body == "The site owner hides the web page description.":
                body = f"Discusion y opiniones de la comunidad de Reddit sobre '{keyword}'."

            trends.append({
                "title": f"Reddit: {title}",
                "description": f"Post y debate en Reddit relacionado con {keyword}: {body}",
                "source_url": href,
                "platform": "REDDIT",
                "query_used": keyword,
                "metadata": {
                    "source": "duckduckgo_reddit_search",
                    "search_query": query,
                },
            })
            break
    log.info("reddit_trends_done", found=len(trends))
    return trends


def make_viral_marketing_trend(result: dict, query: str, format_name: str, source: str) -> dict | None:
    href = (result.get("href") or "").strip()
    title = (result.get("title") or "").strip()
    body = (result.get("body") or "").strip()
    if not title:
        return None
    if title.lower() in {"instagram", "tiktok", "tiktok - make your day"}:
        return None
    if not href:
        href = f"viral-marketing://{urllib.parse.quote(query)}::{urllib.parse.quote(title)}"
    return {
        "title": f"Formato en video ({format_name.replace('_', ' ')}): {title}",
        "description": (
            f"Referencia de formato en video para adaptar al rubro del cliente. "
            f"Formato sugerido: {format_name.replace('_', ' ')}. Referencia: {body}"
        ),
        "source_url": href,
        "platform": "VIRAL_MARKETING",
        "query_used": query,
        "metadata": {
            "source": source,
            "intent": "viral_marketing_inspiration",
            "format": format_name,
            "adaptableToClient": True,
            "search_query": query,
        },
    }


def get_client_format_trends(keywords: list[str], client_name: str) -> list[dict]:
    """Busca formatos aplicados al rubro del cliente, nunca marketing genérico."""
    query_specs = [
        {"query": f"{keyword} rutina video corto argentina", "format": "rutina real"}
        for keyword in keywords[:MAX_KEYWORDS_PER_SOURCE]
        if len(keyword) >= 3
    ]
    log.info("viral_marketing_start", queries=len(query_specs))
    trends = []
    for spec in query_specs:
        query = spec["query"]
        format_name = spec["format"]

        youtube_results = get_youtube_videos_direct(f"{query} shorts", limit=1)
        for video in youtube_results:
            trend = make_viral_marketing_trend(
                {"title": video["title"], "body": video.get("description", ""), "href": video["url"]},
                query,
                format_name,
                "youtube_html_search",
            )
            if trend:
                trends.append(trend)

        for result in search_with_duckduckgo(f"{query} site:tiktok.com OR site:instagram.com/reel", max_results=2):
            href = result.get("href", "")
            if "tiktok.com" not in href and "instagram.com" not in href:
                continue
            trend = make_viral_marketing_trend(result, query, format_name, "duckduckgo_viral_social_search")
            if trend:
                trend["description"] = f"Referencia de formato para {client_name}. {trend['description']}"
                trends.append(trend)
                break
    log.info("viral_marketing_done", found=len(trends))
    return trends


def write_jsonl(rows: list[dict]) -> None:
    INTAKE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INTAKE_PATH.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def add_unique_trends(collected: list[dict], client_id: str, seen: set[str], target: int, bucket: list[dict], all_trends: list[dict]) -> None:
    for trend in collected:
        if not is_audiovisual_reference(trend):
            log.info("trend_discarded", reason="not_audiovisual_reference", platform=trend.get("platform", ""), title=trend.get("title", ""))
            continue
        trend["clientId"] = client_id
        key = trend_key(trend)
        if key in seen:
            continue
        seen.add(key)
        bucket.append(trend)
        all_trends.append(trend)
        if len(bucket) >= target:
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar de videos y formatos para Los 5 Apostoles")
    parser.add_argument("--limit", type=int, default=10, help="Cantidad de referencias nuevas a guardar")
    parser.add_argument("--dry-run", action="store_true", help="No guardar en JSONL ni importar")
    args = parser.parse_args()

    log.info("start", limit=args.limit, dry_run=args.dry_run)
    started_at = time.monotonic()
    budget_seconds = int(os.environ.get("TRENDS_TIME_BUDGET_SECONDS", "600"))

    try:
        clients = load_client_keywords()
        existing_keys = set() if args.dry_run else load_existing_trend_keys()
    except Exception as exc:
        log.error("load_clients_failed", error=str(exc))
        sys.exit(1)

    all_trends = []
    seen = set(existing_keys)
    for client in clients:
        client_trends = []
        keywords = client["keywords"]
        log.info("process_client", client=client["name"], keywords_count=len(keywords))
        if not keywords:
            log.warning("no_keywords", client=client["name"])
            keywords = []

        for offset in range(0, len(keywords), MAX_KEYWORDS_PER_SOURCE):
            if time.monotonic() - started_at > budget_seconds:
                log.warning("time_budget_reached", seconds=budget_seconds)
                break
            if len(client_trends) >= args.limit:
                break

            keyword_batch = keywords[offset:offset + MAX_KEYWORDS_PER_SOURCE]
            collected = []
            source_runners = [
                lambda kws: get_tiktok_creative_center_trends(kws, limit=max(2, min(6, args.limit))),
                get_tiktok_public_search_trends,
                get_instagram_public_search_trends,
                get_youtube_trends,
            ]
            log.info("keyword_batch_start", client=client["name"], offset=offset, batch_size=len(keyword_batch), new_count=len(client_trends))
            for runner in source_runners:
                if time.monotonic() - started_at > budget_seconds:
                    log.warning("time_budget_reached", seconds=budget_seconds)
                    break
                collected.extend(runner(keyword_batch))

            add_unique_trends(collected, client["id"], seen, args.limit, client_trends, all_trends)

        if len(client_trends) < args.limit:
            collected = get_client_format_trends(keywords, client["name"])
            add_unique_trends(collected, client["id"], seen, args.limit, client_trends, all_trends)

        log.info(
            "client_done",
            client=client["name"],
            domain_new_count=len(client_trends),
            target=args.limit,
        )

    if args.dry_run:
        log.info("dry_run_summary", count=len(all_trends), target_per_client=args.limit, clients=len(clients))
        for trend in all_trends:
            print(f"[{trend['platform']}] {trend['title']} (Term: {trend['query_used']})")
        return

    if all_trends:
        write_jsonl(all_trends)
        log.info("saved_to_intake", count=len(all_trends), target_per_client=args.limit, clients=len(clients), path=str(INTAKE_PATH))
        print(f"Se guardaron {len(all_trends)} referencias de video nuevas en {INTAKE_PATH}")
    else:
        print("No se encontraron videos o formatos nuevos relevantes al catalogo hoy.")


if __name__ == "__main__":
    main()
