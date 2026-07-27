"""Free, self-hosted discovery connectors for the social-listening radar.

All connectors are read-only. They return public URLs/snippets and leave the
existing relevance, language, age and duplicate checks to social-listen.py.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
HEALTH_PATH = DATA_DIR / "listener-health.json"
SEARXNG_URL = os.getenv("SEARXNG_URL", "http://127.0.0.1:8080").rstrip("/")
RSSHUB_URL = os.getenv("RSSHUB_URL", "http://127.0.0.1:1200").rstrip("/")
COMPOSE_FILE = ROOT / "docker-compose.social-listening.yml"

CHANNEL_HOSTS = {
    "facebook": ("facebook.com",),
    "instagram": ("instagram.com",),
    "linkedin": ("linkedin.com",),
    "reddit": ("reddit.com",),
    "tiktok": ("tiktok.com",),
    "x": ("x.com", "twitter.com"),
    "youtube": ("youtube.com", "youtu.be"),
}

CHANNEL_SITE_FILTERS = {
    "facebook": ("site:facebook.com/groups/posts",),
    "instagram": ("site:instagram.com/reel",),
    "linkedin": ("site:linkedin.com/posts",),
    "reddit": ("site:reddit.com/comments",),
    "tiktok": ("site:tiktok.com/@",),
    "x": ("site:x.com/status",),
    "youtube": ("site:youtube.com/watch",),
}


def _request(url: str, accept: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": "pcmidi-radar/1.0 (read-only social listening)",
        "Accept": accept,
        # SearXNG con su configuración por defecto exige identificar al
        # cliente incluso cuando la consulta proviene de loopback.
        "X-Forwarded-For": "127.0.0.1",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read()


def _valid_host(url: str, hosts: tuple[str, ...]) -> bool:
    try:
        host = (urllib.parse.urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return any(host == allowed or host.endswith("." + allowed) for allowed in hosts)


def _valid_social_result(channel: str, url: str) -> bool:
    path = (urllib.parse.urlparse(url).path or "").lower()
    if channel == "instagram":
        return path.startswith("/p/") or path.startswith("/reel/")
    if channel == "facebook":
        return "/posts/" in path or "/permalink/" in path or ("/groups/" in path and "/posts/" in path)
    if channel == "x":
        return "/status/" in path
    if channel == "tiktok":
        return "/video/" in path
    if channel == "linkedin":
        return path.startswith("/posts/") or path.startswith("/feed/update/")
    if channel == "reddit":
        return "/comments/" in path
    if channel == "youtube":
        return path == "/watch" or path.startswith("/shorts/")
    return True


def _normalize_url(raw: str) -> str:
    try:
        parsed = urllib.parse.urlparse(raw)
        query = urllib.parse.parse_qs(parsed.query)
        for key in ("url", "q", "u"):
            if key in query and query[key]:
                return query[key][0]
    except ValueError:
        pass
    return raw


def discover_searxng(channel: str, query: str, limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    hosts = CHANNEL_HOSTS.get(channel, ())
    if not hosts:
        return [], {"provider": "searxng", "status": "unsupported_channel"}
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    errors: list[str] = []
    unresponsive: list[str] = []
    retries = 0
    site_filters = CHANNEL_SITE_FILTERS.get(channel) or tuple(f"site:{host}" for host in hosts)
    for site_filter in site_filters:
        search = urllib.parse.quote(f"{site_filter} {query}")
        # Google CSE (the reliable engine in the local SearXNG set) returns no
        # results when forced to the es-AR engine locale. Language is validated
        # later from the actual snippet by social-listen.py.
        url = f"{SEARXNG_URL}/search?format=json&q={search}"
        try:
            payload = json.loads(_request(url, "application/json").decode("utf-8", "replace"))
        except Exception as exc:
            errors.append(str(exc))
            continue
        engines = payload.get("unresponsive_engines", [])
        # Reintentar una sola vez ante un timeout transitorio. CAPTCHA y rate
        # limits no se reintentan porque insistir empeora el bloqueo externo.
        transient_timeout = any("timeout" in " ".join(str(part) for part in engine).lower() for engine in engines if isinstance(engine, (list, tuple)))
        if transient_timeout:
            retries += 1
            time.sleep(float(os.getenv("SEARXNG_TIMEOUT_RETRY_DELAY_SEC", "1")))
            try:
                payload = json.loads(_request(url, "application/json").decode("utf-8", "replace"))
                engines = payload.get("unresponsive_engines", [])
            except Exception as exc:
                errors.append(str(exc))
                continue
        for engine in engines:
            if isinstance(engine, (list, tuple)) and engine:
                unresponsive.append(": ".join(str(value) for value in engine[:2]))
        for result in payload.get("results", []):
            target = _normalize_url(str(result.get("url", "")))
            if not target or target in seen or not _valid_host(target, hosts) or not _valid_social_result(channel, target):
                continue
            seen.add(target)
            text = " ".join(str(result.get(field, "")) for field in ("content", "title")).strip()
            if len(text) < 25:
                continue
            items.append({
                "url": target,
                "title": str(result.get("title", ""))[:220],
                "context": text[:1600],
                "publishedTime": str(result.get("publishedDate", "")),
                "sourceType": f"{channel}_searxng_result",
            })
            if len(items) >= limit:
                break
        if len(items) >= limit:
            break
    if not items and errors:
        return [], {"provider": "searxng", "status": "unavailable", "error": errors[-1]}
    if not items and unresponsive:
        return [], {"provider": "searxng", "status": "degraded", "items": 0, "error": "; ".join(unresponsive[:4]), "retry_attempted": retries}
    return items, {"provider": "searxng", "status": "ok", "items": len(items), "retry_attempted": retries}


def _feed_template(channel: str) -> str:
    return os.getenv(f"RSSHUB_FEED_{channel.upper()}", "").strip()


def discover_rsshub(channel: str, query: str, limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Read an explicitly configured RSSHub route for a source/channel.

    Routes are intentionally configuration-driven: RSSHub routes vary by
    network and account, so inventing a URL would create noisy or invalid data.
    Set RSSHUB_FEED_INSTAGRAM, RSSHUB_FEED_YOUTUBE, etc. with `{query}` where
    the route accepts a search value.
    """
    template = _feed_template(channel)
    if not template:
        return [], {"provider": "rsshub", "status": "not_configured"}
    route = template.replace("{query}", urllib.parse.quote(query))
    url = route if route.startswith("http") else f"{RSSHUB_URL}/{route.lstrip('/')}"
    try:
        root = ET.fromstring(_request(url, "application/rss+xml, application/atom+xml, text/xml"))
    except Exception as exc:
        return [], {"provider": "rsshub", "status": "unavailable", "error": str(exc)}
    entries = list(root.findall(".//item")) + list(root.findall(".//{http://www.w3.org/2005/Atom}entry"))
    items: list[dict[str, Any]] = []
    for entry in entries:
        atom = "{http://www.w3.org/2005/Atom}"
        title = (entry.findtext("title") or entry.findtext(f"{atom}title") or "").strip()
        description = (entry.findtext("description") or entry.findtext(f"{atom}summary") or entry.findtext(f"{atom}content") or "").strip()
        link = (entry.findtext("link") or "").strip()
        if not link:
            link_node = entry.find(f"{atom}link")
            link = link_node.get("href", "") if link_node is not None else ""
        if not link or len(f"{title} {description}".strip()) < 25:
            continue
        items.append({
            "url": link,
            "title": title[:220],
            "context": f"{title} {description}"[:1600],
            "publishedTime": (entry.findtext("pubDate") or entry.findtext(f"{atom}published") or entry.findtext(f"{atom}updated") or ""),
            "sourceType": f"{channel}_rsshub_feed",
        })
        if len(items) >= limit:
            break
    return items, {"provider": "rsshub", "status": "ok", "items": len(items)}


def discover_youtube_ytdlp(query: str, limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Search public YouTube metadata through the installed open-source client.

    It does not authenticate, download media, open a browser profile, or write
    anything to YouTube. The normal opportunity filters still decide whether a
    result can enter the intake.
    """
    try:
        from yt_dlp import YoutubeDL
        options = {
            "extract_flat": True,
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
        }
        with YoutubeDL(options) as client:
            result = client.extract_info(f"ytsearch{max(1, min(limit, 20))}:{query}", download=False)
    except Exception as exc:
        return [], {"provider": "yt-dlp", "status": "unavailable", "error": str(exc)}

    items: list[dict[str, Any]] = []
    for entry in result.get("entries", []) or []:
        url = str(entry.get("webpage_url") or entry.get("url") or "")
        if not url.startswith("http"):
            continue
        title = str(entry.get("title") or "")
        description = str(entry.get("description") or "")
        if len(f"{title} {description}".strip()) < 25:
            continue
        published = str(entry.get("upload_date") or "")
        if len(published) == 8 and published.isdigit():
            published = f"{published[:4]}-{published[4:6]}-{published[6:]}"
        items.append({
            "url": url,
            "title": title[:220],
            "context": f"{title} {description}"[:1600],
            "author": str(entry.get("uploader") or entry.get("channel") or ""),
            "publishedTime": published,
            "sourceType": "youtube_ytdlp_result",
        })
        if len(items) >= limit:
            break
    return items, {"provider": "yt-dlp", "status": "ok", "items": len(items)}


def discover_public(channel: str, query: str, limit: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rss_items, rss_health = discover_rsshub(channel, query, limit)
    searx_items, searx_health = discover_searxng(channel, query, limit)
    ytdlp_items: list[dict[str, Any]] = []
    ytdlp_health: dict[str, Any] | None = None
    if channel == "youtube":
        ytdlp_items, ytdlp_health = discover_youtube_ytdlp(query, limit)
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in rss_items + searx_items + ytdlp_items:
        url = str(item.get("url", ""))
        if not url or url in seen:
            continue
        seen.add(url)
        items.append(item)
        if len(items) >= limit:
            break
    providers = [rss_health, searx_health]
    if ytdlp_health:
        providers.append(ytdlp_health)
    return items, providers


def _service_url(name: str) -> str:
    return f"{SEARXNG_URL}/healthz" if name == "searxng" else RSSHUB_URL


def _probe_service(name: str) -> dict[str, Any]:
    url = _service_url(name)
    try:
        _request(url, "application/json, text/plain")
        return {"name": name, "status": "ok", "url": url}
    except Exception as exc:
        return {"name": name, "status": "unavailable", "url": url, "error": str(exc)}


def recover_local_services() -> dict[str, Any]:
    """Start unavailable local discovery containers, then wait briefly for them.

    This is deliberately best-effort: discovery remains non-blocking when Docker
    Desktop is stopped or unavailable, and the returned detail is kept in the
    normal listening report for an operator to inspect.
    """
    before = [_probe_service(name) for name in ("searxng", "rsshub")]
    unavailable = [service["name"] for service in before if service["status"] != "ok"]
    result: dict[str, Any] = {"attempted": False, "before": before, "after": before, "services": unavailable}
    if not unavailable or os.getenv("LISTENING_AUTO_RECOVER", "true").lower() in {"0", "false", "no"}:
        return result
    if not COMPOSE_FILE.exists():
        result["error"] = f"No existe {COMPOSE_FILE.name}"
        return result
    docker = shutil.which("docker")
    if not docker:
        result["error"] = "Docker no está disponible en PATH"
        return result
    result["attempted"] = True
    try:
        completed = subprocess.run(
            [docker, "compose", "-f", str(COMPOSE_FILE), "up", "-d", *unavailable],
            cwd=ROOT, capture_output=True, text=True, timeout=45, check=False,
        )
        result["command"] = "docker compose -f docker-compose.social-listening.yml up -d " + " ".join(unavailable)
        if completed.returncode:
            result["error"] = (completed.stderr or completed.stdout or f"docker exit {completed.returncode}").strip()[-1000:]
            return result
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            after = [_probe_service(name) for name in ("searxng", "rsshub")]
            if all(service["status"] == "ok" for service in after if service["name"] in unavailable):
                result["after"] = after
                result["recovered"] = unavailable
                return result
            time.sleep(1)
        result["after"] = [_probe_service(name) for name in ("searxng", "rsshub")]
        result["error"] = "Los servicios no respondieron dentro de 20 segundos"
    except (OSError, subprocess.TimeoutExpired) as exc:
        result["error"] = str(exc)
    return result


def health() -> dict[str, Any]:
    result = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "services": [_probe_service("searxng"), _probe_service("rsshub")],
        "tools": {
            "instaloader": _module_available("instaloader"),
            "instagrapi": _module_available("instagrapi"),
            "TikTokApi": _module_available("TikTokApi"),
            "praw": _module_available("praw"),
            "yt_dlp": _module_available("yt_dlp"),
        },
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HEALTH_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


def _module_available(name: str) -> bool:
    try:
        __import__(name)
        return True
    except ImportError:
        return False
