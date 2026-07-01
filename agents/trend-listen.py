#!/usr/bin/env python3
"""
Agente de escucha de tendencias (Trend Listener) para Los 5 Apóstoles.
Busca diariamente búsquedas calientes, hashtags y discusiones relevantes en Argentina (AR)
filtrándolas y mapeándolas con las palabras clave del catálogo de la tienda.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
import urllib.parse

import requests
import feedparser

# Configurar encoding UTF-8 para evitar errores con emojis en consolas Windows (cp1252)
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))
from _log import get_logger
from db_pg import connect

log = get_logger("trend-listen")
INTAKE_PATH = ROOT / "data" / "trends-intake.jsonl"


def load_client_keywords() -> list[dict]:
    """Obtiene los clientes activos y sus keywords del catálogo/dominio."""
    clients_data = []
    with connect() as conn:
        rows = conn.execute(
            'SELECT id, name, slug, "domainKeywords" FROM "Client" WHERE active = true'
        ).fetchall()
        for r in rows:
            try:
                kws = json.loads(r["domainKeywords"] or "[]")
            except Exception:
                kws = []
            
            # Obtener también marcas asociadas para ampliar keywords
            brands = conn.execute(
                'SELECT name FROM "Brand" WHERE "clientId" = %s', (r["id"],)
            ).fetchall()
            brand_names = [b["name"].lower() for b in brands]
            
            # Combinar keywords
            kws = list(set([k.lower() for k in kws] + brand_names))
            
            clients_data.append({
                "id": r["id"],
                "name": r["name"],
                "slug": r["slug"],
                "keywords": kws
            })
    return clients_data


def get_google_trends_ar(keywords: list[str]) -> list[dict]:
    """Obtiene tendencias diarias de Google Trends en Argentina y las filtra por keywords."""
    log.info("google_trends_start", details="Obteniendo RSS de Google Trends AR")
    url = "https://trends.google.com/trending/rss?geo=AR"
    trends = []
    try:
        response = requests.get(url, timeout=15)
        if response.status_code != 200:
            log.error("google_trends_error", status=response.status_code)
            return []
        
        feed = feedparser.parse(response.content)
        for entry in feed.entries:
            title = entry.title
            desc = getattr(entry, "description", "")
            traffic = getattr(entry, "ht_approx_traffic", "N/A")
            
            # Buscar coincidencia con nuestras palabras clave
            combined_text = (title + " " + desc).lower()
            matched_kw = None
            for kw in keywords:
                if re.search(r'\b' + re.escape(kw) + r'\b', combined_text):
                    matched_kw = kw
                    break
            
            if matched_kw or any(kw in combined_text for kw in keywords if len(kw) > 4):
                trends.append({
                    "title": f"Google Trend: {title}",
                    "description": f"Tendencia en Google Argentina con {traffic} búsquedas. Relacionado con: {matched_kw or 'catálogo'}. {desc}",
                    "source_url": entry.link,
                    "platform": "GOOGLE_TRENDS",
                    "query_used": matched_kw or "general_match",
                    "metadata": {
                        "approx_traffic": traffic,
                        "published": getattr(entry, "published", "")
                    }
                })
    except Exception as e:
        log.error("google_trends_exception", error=str(e))
    
    log.info("google_trends_done", found=len(trends))
    return trends


def get_twitter_trends_ar(keywords: list[str]) -> list[dict]:
    """Obtiene tendencias de Twitter (X) en Argentina desde Trends24 y filtra."""
    log.info("twitter_trends_start", details="Obteniendo tendencias de Twitter AR de Trends24")
    url = "https://trends24.in/argentina/"
    trends = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            log.error("twitter_trends_error", status=response.status_code)
            return []
        
        matches = re.findall(r'href="/search\?q=([^"]+)"[^>]*>([^<]+)</a>', response.text)
        
        unique_tags = {}
        for query_encoded, name in matches:
            query = urllib.parse.unquote(query_encoded)
            name_clean = name.strip()
            if name_clean and name_clean not in unique_tags:
                unique_tags[name_clean] = query
        
        for name, query in unique_tags.items():
            name_lower = name.lower()
            matched_kw = None
            for kw in keywords:
                if re.search(r'\b' + re.escape(kw) + r'\b', name_lower) or (kw in name_lower and len(kw) > 4):
                    matched_kw = kw
                    break
            
            if matched_kw:
                trends.append({
                    "title": f"Twitter Trend: {name}",
                    "description": f"Tema caliente en Twitter/X Argentina. Detectado bajo el término: {matched_kw}.",
                    "source_url": f"https://x.com/search?q={urllib.parse.quote(name)}",
                    "platform": "TWITTER",
                    "query_used": matched_kw,
                    "metadata": {
                        "trend_query": query
                    }
                })
    except Exception as e:
        log.error("twitter_trends_exception", error=str(e))
        
    log.info("twitter_trends_done", found=len(trends))
    return trends


def get_youtube_videos_direct(query: str, limit: int = 3) -> list[dict]:
    """Busca videos en YouTube directamente analizando la respuesta HTML y ytInitialData."""
    url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-419,es;q=0.9"
    }
    videos = []
    try:
        r = requests.get(url, headers=headers, timeout=12)
        if r.status_code != 200:
            return []
        
        match = re.search(r"ytInitialData\s*=\s*(\{.+?\});", r.text)
        if not match:
            match = re.search(r"var ytInitialData\s*=\s*(\{.+?\});", r.text)
            
        if match:
            data = json.loads(match.group(1))
            try:
                contents = data['contents']['twoColumnSearchResultsRenderer']['primaryContents']['sectionListRenderer']['contents']
                for section in contents:
                    if 'itemSectionRenderer' in section:
                        items = section['itemSectionRenderer']['contents']
                        for item in items:
                            if 'videoRenderer' in item:
                                vr = item['videoRenderer']
                                video_id = vr.get('videoId')
                                title = vr.get('title', {}).get('runs', [{}])[0].get('text', '')
                                desc = "".join([x.get('text', '') for x in vr.get('descriptionSnippet', {}).get('runs', [])])
                                if not desc and 'detailedMetadataSnippets' in vr:
                                    desc = vr['detailedMetadataSnippets'][0].get('snippetText', {}).get('runs', [{}])[0].get('text', '')
                                
                                if video_id and title:
                                    videos.append({
                                        "title": title,
                                        "description": desc,
                                        "url": f"https://www.youtube.com/watch?v={video_id}"
                                    })
                                    if len(videos) >= limit:
                                        return videos
            except Exception as je:
                log.warning("yt_json_parse_error", error=str(je))
    except Exception as e:
        log.warning("youtube_html_search_failed", query=query, error=str(e))
    return videos


def get_youtube_and_tiktok_trends(keywords: list[str]) -> list[dict]:
    """Encuentra videos recientes de YouTube y TikTok relacionados a keywords."""
    log.info("video_trends_start", details="Buscando videos en YouTube para keywords de catálogo")
    trends = []
    
    # 1. YouTube Direct
    for kw in keywords:
        if len(kw) < 3:
            continue
        query_yt = f"{kw} argentina"
        videos = get_youtube_videos_direct(query_yt, limit=2)
        for v in videos:
            trends.append({
                "title": f"YouTube Video: {v['title']}",
                "description": f"Video detectado en YouTube sobre {kw} en Argentina: {v['description']}",
                "source_url": v["url"],
                "platform": "YOUTUBE",
                "query_used": kw,
                "metadata": {}
            })
            
    # 2. TikTok Fallback usando DuckDuckGo Text search (que tiene menos rate limits que video search)
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            for kw in keywords:
                if len(kw) < 3:
                    continue
                query_tt = f"{kw} argentina site:tiktok.com"
                try:
                    tt_results = list(ddgs.text(query_tt, max_results=1))
                    for r in tt_results:
                        trends.append({
                            "title": f"TikTok: {r.get('title', '')}",
                            "description": f"Contenido reciente en TikTok sobre {kw} en Argentina: {r.get('body', '')}",
                            "source_url": r.get("href", ""),
                            "platform": "TIKTOK",
                            "query_used": kw,
                            "metadata": {}
                        })
                except Exception as e:
                    # Silenciar errores individuales de DDG
                    pass
    except Exception as e:
        log.warning("ddgs_tiktok_search_failed", error=str(e))

    log.info("video_trends_done", found=len(trends))
    return trends


def write_jsonl(rows: list[dict]) -> None:
    """Escribe los resultados en el archivo intake JSONL."""
    INTAKE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with INTAKE_PATH.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Radar de tendencias para Los 5 Apóstoles (Argentina)")
    parser.add_argument("--limit", type=int, default=15, help="Límite de tendencias a procesar")
    parser.add_argument("--dry-run", action="store_true", help="No guardar en base de datos o archivo JSONL")
    args = parser.parse_args()

    log.info("start", limit=args.limit, dry_run=args.dry_run)
    
    try:
        clients = load_client_keywords()
    except Exception as e:
        log.error("load_clients_failed", error=str(e))
        sys.exit(1)
        
    all_collected_trends = []
    
    for client in clients:
        log.info("process_client", client=client["name"], keywords_count=len(client["keywords"]))
        kws = client["keywords"]
        if not kws:
            log.warn("no_keywords", client=client["name"])
            continue
        
        # 1. Google Trends (AR)
        g_trends = get_google_trends_ar(kws)
        for t in g_trends:
            t["clientId"] = client["id"]
        all_collected_trends.extend(g_trends)
        
        # 2. Twitter Trends (AR)
        x_trends = get_twitter_trends_ar(kws)
        for t in x_trends:
            t["clientId"] = client["id"]
        all_collected_trends.extend(x_trends)
        
        # 3. YouTube & TikTok
        social_trends = get_youtube_and_tiktok_trends(kws)
        for t in social_trends:
            t["clientId"] = client["id"]
        all_collected_trends.extend(social_trends)

    # Limitar y deduplicar tendencias recolectadas en esta corrida
    seen_urls = set()
    unique_trends = []
    for t in all_collected_trends:
        url = t["source_url"]
        if url not in seen_urls:
            seen_urls.add(url)
            unique_trends.append(t)
            
    unique_trends = unique_trends[:args.limit]
    
    if args.dry_run:
        log.info("dry_run_summary", count=len(unique_trends))
        for t in unique_trends:
            print(f"[{t['platform']}] {t['title']} (Term: {t['query_used']})")
    else:
        if unique_trends:
            write_jsonl(unique_trends)
            log.info("saved_to_intake", count=len(unique_trends), path=str(INTAKE_PATH))
            print(f"Se recolectaron y guardaron {len(unique_trends)} tendencias en {INTAKE_PATH}")
        else:
            print("No se encontraron tendencias relevantes al catálogo hoy.")


if __name__ == "__main__":
    main()
