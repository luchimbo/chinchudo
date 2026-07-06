#!/usr/bin/env python3
"""Radar de tendencias editoriales para Los 5 Apostoles.

Recolecta senales de Google Trends Argentina, TikTok, YouTube Shorts e
Instagram para alimentar la guionera. Es solo lectura: no publica, no comenta
ni interactua con redes.
"""
import argparse
import json
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
MAX_KEYWORDS_PER_SOURCE = 4


def load_client_keywords() -> list[dict]:
    clients_data = []
    with connect() as conn:
        rows = conn.execute('SELECT id, name, slug, "domainKeywords" FROM "Client" WHERE active = true').fetchall()
        for row in rows:
            try:
                keywords = json.loads(row["domainKeywords"] or "[]")
            except Exception:
                keywords = []

            brands = conn.execute('SELECT name FROM "Brand" WHERE "clientId" = %s', (row["id"],)).fetchall()
            brand_names = [brand["name"].lower() for brand in brands]
            merged = sorted({str(keyword).lower() for keyword in keywords if keyword} | set(brand_names))

            clients_data.append({
                "id": row["id"],
                "name": row["name"],
                "slug": row["slug"],
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
    endpoints = [
        "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&country_code=AR&limit=50",
        "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/sound/list?period=7&country_code=AR&limit=50",
    ]

    for endpoint in endpoints:
        try:
            response = requests.get(endpoint, headers=DEFAULT_HEADERS, timeout=8)
            if response.status_code != 200:
                log.warning("tiktok_creative_center_http", status=response.status_code)
                continue
            payload = response.json()
        except Exception as exc:
            log.warning("tiktok_creative_center_failed", error=str(exc))
            continue

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
            title = row.get("hashtag_name") or row.get("keyword") or row.get("song_name") or row.get("title") or row.get("name")
            if not title:
                continue
            matched = keyword_match(json.dumps(row, ensure_ascii=False), keywords) or "argentina"
            trends.append({
                "title": f"TikTok Creative Center: {title}",
                "description": "Tendencia detectada en TikTok Creative Center para Argentina. Revisar fuente y adaptar al catalogo antes de publicar.",
                "source_url": "https://ads.tiktok.com/creative/creativeCenter/trends",
                "platform": "TIKTOK_CREATIVE_CENTER",
                "query_used": matched,
                "metadata": {
                    "source": "tiktok_creative_center",
                    "country": "AR",
                    "raw": row,
                },
            })
    log.info("tiktok_creative_center_done", found=len(trends))
    return trends[:limit]


def search_with_duckduckgo(query: str, max_results: int = 1) -> list[dict]:
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
        for result in search_with_duckduckgo(f"{keyword} argentina site:tiktok.com", max_results=1):
            trends.append({
                "title": f"TikTok: {result.get('title', '')}",
                "description": f"Contenido reciente en TikTok sobre {keyword} en Argentina: {result.get('body', '')}",
                "source_url": result.get("href", ""),
                "platform": "TIKTOK",
                "query_used": keyword,
                "metadata": {"source": "duckduckgo_site_search"},
            })
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


def write_jsonl(rows: list[dict]) -> None:
    INTAKE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INTAKE_PATH.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar de tendencias editoriales para Los 5 Apostoles")
    parser.add_argument("--limit", type=int, default=15, help="Limite de tendencias a procesar")
    parser.add_argument("--dry-run", action="store_true", help="No guardar en JSONL ni importar")
    args = parser.parse_args()

    log.info("start", limit=args.limit, dry_run=args.dry_run)
    started_at = time.monotonic()
    budget_seconds = 75

    try:
        clients = load_client_keywords()
    except Exception as exc:
        log.error("load_clients_failed", error=str(exc))
        sys.exit(1)

    all_trends = []
    for client in clients:
        keywords = client["keywords"]
        log.info("process_client", client=client["name"], keywords_count=len(keywords))
        if not keywords:
            log.warning("no_keywords", client=client["name"])
            continue

        collected = []
        source_runners = [
            get_google_trends_ar,
            get_twitter_trends_ar,
            lambda kws: get_tiktok_creative_center_trends(kws, limit=max(2, min(6, args.limit))),
            get_tiktok_public_search_trends,
            get_instagram_public_search_trends,
            get_youtube_trends,
        ]
        for runner in source_runners:
            if len(all_trends) + len(collected) >= args.limit:
                break
            if time.monotonic() - started_at > budget_seconds:
                log.warning("time_budget_reached", seconds=budget_seconds)
                break
            collected.extend(runner(keywords))

        for trend in collected:
            trend["clientId"] = client["id"]
        all_trends.extend(collected)

    seen = set()
    unique_trends = []
    for trend in all_trends:
        dedupe_key = trend.get("source_url") or f"{trend.get('platform')}::{trend.get('title')}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        unique_trends.append(trend)
        if len(unique_trends) >= args.limit:
            break

    if args.dry_run:
        log.info("dry_run_summary", count=len(unique_trends))
        for trend in unique_trends:
            print(f"[{trend['platform']}] {trend['title']} (Term: {trend['query_used']})")
        return

    if unique_trends:
        write_jsonl(unique_trends)
        log.info("saved_to_intake", count=len(unique_trends), path=str(INTAKE_PATH))
        print(f"Se guardaron {len(unique_trends)} tendencias en {INTAKE_PATH}")
    else:
        print("No se encontraron tendencias relevantes al catalogo hoy.")


if __name__ == "__main__":
    main()
