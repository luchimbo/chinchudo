from __future__ import annotations

import re

import httpx


SKIP_DOMAINS = ("facebook.com", "tiktok.com", "reddit.com")


def should_extract(url: str) -> bool:
    return url.startswith("http") and not any(domain in url for domain in SKIP_DOMAINS)


def clean_text(text: str, max_chars: int = 1200) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def extract_text(url: str, max_chars: int = 1200) -> str:
    if not should_extract(url):
        return ""

    if "instagram.com" in url:
        try:
            from authority_swarm.sources.playwright_extractor import extract_instagram_post

            text = extract_instagram_post(url, max_chars=max_chars)
            if text:
                return text
        except Exception:
            pass
        return ""

    try:
        from scrapling.fetchers import Fetcher

        page = Fetcher.get(url, timeout=20)
        text_parts = page.css("body ::text").getall()
        return clean_text(" ".join(text_parts), max_chars=max_chars)
    except Exception:
        return extract_text_httpx(url, max_chars=max_chars)


def extract_text_httpx(url: str, max_chars: int = 1200) -> str:
    try:
        response = httpx.get(
            url,
            headers={"User-Agent": "authority-swarm/0.1 public research bot"},
            follow_redirects=True,
            timeout=20,
        )
        response.raise_for_status()
    except Exception:
        return ""

    html = re.sub(r"(?is)<(script|style|noscript).*?</\1>", " ", response.text)
    text = re.sub(r"(?s)<[^>]+>", " ", html)
    return clean_text(text, max_chars=max_chars)


def enrich_results(results: list[dict[str, str]], max_pages: int = 5) -> list[dict[str, str]]:
    enriched: list[dict[str, str]] = []
    extracted = 0
    for result in results:
        item = dict(result)
        if extracted < max_pages:
            text = extract_text(item.get("url", ""))
            if text:
                item["page_text"] = text
                item["original_text"] = item.get("original_text") or text
                extracted += 1
        enriched.append(item)
    return enriched
