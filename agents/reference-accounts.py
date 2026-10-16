#!/usr/bin/env python3
"""Lectura de cuentas de referencia (método ig-viral) para el Estudio de Reels.

Para cada cuenta activa de un cliente lee sus últimos ~12 videos con las vistas,
para que el importador compare cada video contra la mediana de su propia cuenta.

- YouTube: pestaña /shorts del canal, sin login (ytInitialData).
- Instagram y TikTok: grilla del perfil en el navegador real (perfil de
  accounts.json), a ritmo humano. Si aparece login, 2FA, captcha o checkpoint,
  frena esa cuenta y lo registra: nunca intenta resolverlo.

Solo lectura: no sigue, no da like, no comenta. Escribe data/reference-intake.jsonl
y un reporte. --dry-run imprime lo que leería sin escribir nada.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import random
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "agents"))

from _log import get_logger  # noqa: E402
from _config import load_accounts, write_report  # noqa: E402

log = get_logger("reference-accounts")
INTAKE_PATH = ROOT / "data" / "reference-intake.jsonl"
PER_ACCOUNT = 12
RESCAN_AFTER = timedelta(days=6)
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
}

# parse_view_count vive en trend-listen.py (nombre con guion: se carga por ruta).
_spec = importlib.util.spec_from_file_location("trend_listen", ROOT / "agents" / "trend-listen.py")
_trend_listen = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_trend_listen)
parse_view_count = _trend_listen.parse_view_count


# ── Selección de cuentas ─────────────────────────────────────────────

def due_for_scan(account: dict, now: datetime, force: bool = False) -> bool:
    """Se lee si alguien pidió "Leer ahora", si nunca se leyó o si pasó una semana."""
    if force:
        return True
    last = account.get("lastScannedAt")
    requested = account.get("scanRequestedAt")
    if requested and (not last or requested > last):
        return True
    return not last or now - last >= RESCAN_AFTER


def load_reference_accounts(client_slug: str | None) -> list[dict]:
    from db_pg import connect

    query = (
        'SELECT r.id, r."clientId", r.platform, r.handle, r.url, r."lastScannedAt", r."scanRequestedAt", c.slug AS "clientSlug" '
        'FROM "ReferenceAccount" r JOIN "Client" c ON c.id = r."clientId" '
        'WHERE r.active = true AND c.active = true'
    )
    params: tuple = ()
    if client_slug:
        query += " AND c.slug = %s"
        params = (client_slug,)
    with connect() as conn:
        rows = conn.execute(query + ' ORDER BY r."lastScannedAt" NULLS FIRST', params).fetchall()
    for row in rows:
        for key in ("lastScannedAt", "scanRequestedAt"):
            if row.get(key) and row[key].tzinfo is None:
                row[key] = row[key].replace(tzinfo=timezone.utc)
    return rows


# ── YouTube (sin login) ──────────────────────────────────────────────

def _walk(node, found: list):
    if isinstance(node, dict):
        if "reelItemRenderer" in node or "shortsLockupViewModel" in node or "videoRenderer" in node:
            found.append(node)
        for value in node.values():
            _walk(value, found)
    elif isinstance(node, list):
        for value in node:
            _walk(value, found)


def _text(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if "simpleText" in value:
        return value["simpleText"]
    if "content" in value:
        return value["content"]
    return "".join(part.get("text", "") for part in value.get("runs", []))


def parse_youtube_items(initial_data: dict, limit: int = PER_ACCOUNT) -> list[dict]:
    """Saca id, título y vistas de los Shorts (formato viejo y nuevo) o videos del canal."""
    nodes: list = []
    _walk(initial_data, nodes)
    items, seen = [], set()
    for node in nodes:
        if "reelItemRenderer" in node:
            item = node["reelItemRenderer"]
            video_id = item.get("videoId")
            title = _text(item.get("headline"))
            views = parse_view_count(_text(item.get("viewCountText")))
            url = f"https://www.youtube.com/shorts/{video_id}"
        elif "shortsLockupViewModel" in node:
            item = node["shortsLockupViewModel"]
            overlay = item.get("overlayMetadata", {})
            video_id = (item.get("onTap", {}).get("innertubeCommand", {}).get("reelWatchEndpoint", {}).get("videoId")
                        or str(item.get("entityId", "")).replace("shorts-shelf-item-", ""))
            title = _text(overlay.get("primaryText"))
            views = parse_view_count(_text(overlay.get("secondaryText")))
            url = f"https://www.youtube.com/shorts/{video_id}"
        else:
            item = node["videoRenderer"]
            video_id = item.get("videoId")
            title = _text(item.get("title"))
            views = parse_view_count(_text(item.get("viewCountText")))
            url = f"https://www.youtube.com/watch?v={video_id}"
        if not video_id or video_id in seen or not title:
            continue
        seen.add(video_id)
        items.append({"title": title, "url": url, "views": views})
        if len(items) >= limit:
            break
    return items


def read_youtube(account: dict) -> list[dict]:
    base = account["url"].rstrip("/")
    statuses = []
    for suffix in ("/shorts", "/videos"):
        response = requests.get(base + suffix, headers=HEADERS, timeout=15)
        statuses.append(response.status_code)
        if response.status_code != 200:
            continue
        match = re.search(r"ytInitialData\s*=\s*(\{.+?\});</script>", response.text) or re.search(r"ytInitialData\s*=\s*(\{.+?\});", response.text)
        if not match:
            continue
        items = parse_youtube_items(json.loads(match.group(1)))
        if items:
            return items
    if statuses and all(status == 404 for status in statuses):
        raise RuntimeError("no encontramos ese canal; revisá el link")
    raise RuntimeError("no se encontraron videos públicos en el canal")


# ── Instagram y TikTok (navegador real) ──────────────────────────────

GRID_SCRIPT = {
    "INSTAGRAM": r"""
(() => {
  const blocked = !!(document.querySelector('input[name="username"]') || location.href.includes('/accounts/login') || location.href.includes('/challenge') || (document.title || '').toLowerCase().includes('log in'));
  const tiles = Array.from(document.querySelectorAll('a[href*="/reel/"]')).map(a => ({
    url: a.href.split('?')[0],
    title: (a.querySelector('img')?.alt || '').slice(0, 300),
    viewsText: Array.from(a.querySelectorAll('span')).map(s => s.textContent || '').find(t => /\d/.test(t)) || ''
  }));
  return { blocked, tiles };
})()
""",
    "TIKTOK": r"""
(() => {
  const blocked = !!(document.querySelector('#captcha-verify-container, .captcha_verify_container, [data-e2e="login-modal"]') || location.href.includes('/login'));
  const tiles = Array.from(document.querySelectorAll('[data-e2e="user-post-item"]')).map(item => ({
    url: (item.querySelector('a[href*="/video/"]')?.href || '').split('?')[0],
    title: (item.querySelector('img')?.alt || '').slice(0, 300),
    viewsText: item.querySelector('[data-e2e="video-views"]')?.textContent || ''
  })).filter(t => t.url);
  return { blocked, tiles };
})()
""",
}


def grid_items(raw_tiles: list[dict], limit: int = PER_ACCOUNT) -> list[dict]:
    items, seen = [], set()
    for tile in raw_tiles:
        url = tile.get("url") or ""
        if not url or url in seen:
            continue
        seen.add(url)
        items.append({"title": (tile.get("title") or "").strip() or url, "url": url, "views": parse_view_count(tile.get("viewsText"))})
        if len(items) >= limit:
            break
    return items


def read_with_browser(account: dict, browser_account: str | None) -> list[dict]:
    from _browser import close_tab, open_new_tab
    from _cdp import evaluate

    platform = account["platform"]
    target = account["url"].rstrip("/") + ("/reels/" if platform == "INSTAGRAM" else "")
    client, tab_id = open_new_tab(browser_account)
    try:
        client.send("Page.enable")
        client.send("Page.navigate", {"url": target})
        time.sleep(random.uniform(4, 7))
        result: dict = {}
        for _ in range(4):
            result = evaluate(client, GRID_SCRIPT[platform]) or {}
            if result.get("blocked"):
                raise RuntimeError("la red pidió login o verificación; resolvelo a mano en el perfil del navegador")
            if len(result.get("tiles") or []) >= PER_ACCOUNT:
                break
            # Scroll suave y pausas variables, como una persona mirando el perfil.
            evaluate(client, f"window.scrollBy({{top: {random.randint(500, 900)}, behavior: 'smooth'}})")
            time.sleep(random.uniform(2.5, 5.5))
        items = grid_items(result.get("tiles") or [])
        if not items:
            raise RuntimeError("no se encontraron videos en el perfil")
        return items
    finally:
        close_tab(browser_account, tab_id)
        client.__exit__(None, None, None)


def browser_account_for(client_slug: str, platform: str, explicit: str | None) -> str | None:
    if explicit:
        return explicit
    channel = platform.lower()
    for name, config in load_accounts().items():
        if config.get("clientSlug") == client_slug and channel in (config.get("allowedChannels") or []):
            return name
    return None


# ── Corrida ──────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Lee las cuentas de referencia del Estudio de Reels")
    parser.add_argument("--client", help="Slug del cliente; por defecto, todos")
    parser.add_argument("--account", help="Perfil de navegador de accounts.json para Instagram/TikTok")
    parser.add_argument("--all", action="store_true", help="Leer todas las cuentas activas aunque se hayan leído hace poco")
    parser.add_argument("--limit", type=int, default=12, help="Máximo de cuentas por corrida")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    accounts = [a for a in load_reference_accounts(args.client) if due_for_scan(a, now, args.all)][: args.limit]
    log.info("reference_scan_start", accounts=len(accounts), dry_run=args.dry_run)
    rows: list[dict] = []
    summary = {"accounts": len(accounts), "read": 0, "failed": 0, "videos": 0, "errors": []}

    for index, account in enumerate(accounts):
        label = f"{account['platform']} @{account['handle']}"
        try:
            if account["platform"] == "YOUTUBE":
                items = read_youtube(account)
            else:
                browser_account = browser_account_for(account["clientSlug"], account["platform"], args.account)
                if not browser_account:
                    raise RuntimeError(f"no hay un perfil de navegador para {account['platform'].lower()} en accounts.json")
                items = read_with_browser(account, browser_account)
            summary["read"] += 1
            summary["videos"] += len(items)
            print(f"[ok] {label}: {len(items)} videos, {sum(1 for i in items if i['views'])} con vistas")
            rows.append({"type": "account", "referenceAccountId": account["id"], "clientId": account["clientId"], "ok": True, "error": ""})
            for item in items:
                rows.append({
                    "type": "video", "referenceAccountId": account["id"], "clientId": account["clientId"], "platform": account["platform"],
                    "handle": account["handle"], "title": item["title"], "source_url": item["url"], "views": item["views"],
                })
        except Exception as exc:
            summary["failed"] += 1
            summary["errors"].append({"account": label, "error": str(exc)})
            print(f"[error] {label}: {exc}")
            rows.append({"type": "account", "referenceAccountId": account["id"], "clientId": account["clientId"], "ok": False, "error": str(exc)[:240]})
        if index < len(accounts) - 1 and account["platform"] != "YOUTUBE":
            time.sleep(random.uniform(20, 45))

    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    elif rows:
        INTAKE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with INTAKE_PATH.open("a", encoding="utf-8") as handle:
            for row in rows:
                handle.write(json.dumps(row, ensure_ascii=False) + "\n")
    report = write_report("reference-accounts", {"command": "reference-accounts", "date": now.isoformat(), "dry_run": args.dry_run, **summary})
    print(f"Reporte: {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
