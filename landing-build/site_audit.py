"""Auditoría del sitio estático ya construido.

Lee el HTML generado (no la base) para verificar lo que el crawler realmente
verá: enlaces internos rotos, canonicals, robots, H1, páginas huérfanas,
profundidad de clics desde la portada y coherencia del sitemap.
"""

from __future__ import annotations

from collections import deque
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

MAX_CLICK_DEPTH = 3
IGNORED_PREFIXES = ("/api/", "/assets/", "/l/")


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.canonical = ""
        self.robots = ""
        self.h1_count = 0
        self.hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {key: value or "" for key, value in attrs}
        if tag == "link" and data.get("rel", "").lower() == "canonical":
            self.canonical = data.get("href", "")
        elif tag == "meta" and data.get("name", "").lower() == "robots":
            self.robots = data.get("content", "").lower()
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "a" and data.get("href"):
            self.hrefs.append(data["href"])


def page_path_for(file: Path, site_dir: Path) -> str:
    relative = file.relative_to(site_dir).as_posix()
    if relative == "index.html":
        return "/"
    if relative.endswith("/index.html"):
        return "/" + relative[: -len("index.html")]
    return "/" + relative


def normalize_internal_href(href: str, current_path: str, base_url: str) -> str | None:
    """Devuelve el path interno enlazado, o None si es externo/no navegable."""
    href = href.strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    parsed = urlparse(href)
    base = urlparse(base_url) if base_url else None
    if parsed.scheme or parsed.netloc:
        if not base or parsed.netloc.lower() != base.netloc.lower():
            return None
        path = parsed.path or "/"
    elif href.startswith("/"):
        path = parsed.path
    else:
        # Relativo: se resuelve contra el directorio de la página actual.
        stack = [part for part in current_path.split("/") if part]
        for part in parsed.path.split("/"):
            if part == "..":
                if stack:
                    stack.pop()
            elif part and part != ".":
                stack.append(part)
        path = "/" + "/".join(stack) + ("/" if parsed.path.endswith("/") or not parsed.path else "")
    path = unquote(path)
    if path.endswith("/index.html"):
        path = path[: -len("index.html")]
    if path.startswith(IGNORED_PREFIXES):
        return None
    if not path.endswith("/") and "." not in path.rsplit("/", 1)[-1]:
        path += "/"
    return path


def path_exists(site_dir: Path, path: str) -> bool:
    target = site_dir / path.strip("/")
    if path.endswith("/"):
        return (target / "index.html").exists()
    return target.exists()


def audit_site(
    site_dir: Path,
    base_url: str,
    sitemap_urls: list[str],
    editorial_paths: set[str],
) -> dict:
    """Audita el sitio. `editorial_paths` son las guías/pilares/hubs nuevos:
    sobre ellos las reglas de huérfanas y profundidad bloquean el deploy.
    """
    base = base_url.rstrip("/")
    pages: dict[str, _PageParser] = {}
    for file in sorted(site_dir.rglob("*.html")):
        parser = _PageParser()
        parser.feed(file.read_text(encoding="utf-8", errors="replace"))
        pages[page_path_for(file, site_dir)] = parser

    outbound: dict[str, set[str]] = {path: set() for path in pages}
    inbound: dict[str, set[str]] = {path: set() for path in pages}
    broken: list[dict] = []
    for path, page in pages.items():
        for href in page.hrefs:
            target = normalize_internal_href(href, path, base)
            if target is None:
                continue
            if not path_exists(site_dir, target):
                broken.append({"page": path, "href": href})
                continue
            if target != path and target in pages:
                outbound[path].add(target)
                inbound[target].add(path)

    depth: dict[str, int] = {"/": 0} if "/" in pages else {}
    queue = deque(depth)
    while queue:
        current = queue.popleft()
        for target in outbound.get(current, ()):
            if target not in depth:
                depth[target] = depth[current] + 1
                queue.append(target)

    indexable = {path for path, page in pages.items() if "noindex" not in page.robots}
    noindex = sorted(set(pages) - indexable)
    sitemap_paths = {unquote(urlparse(url).path or "/") for url in sitemap_urls}

    errors: list[str] = []
    warnings: list[str] = []
    for item in broken:
        errors.append(f"enlace roto en {item['page']}: {item['href']}")
    for path in sorted(indexable):
        page = pages[path]
        expected = f"{base}{path}" if base else path
        if page.canonical != expected:
            errors.append(f"canonical incorrecta en {path}: {page.canonical or '(vacía)'} != {expected}")
        is_editorial = path in editorial_paths
        if page.h1_count != 1:
            (errors if is_editorial else warnings).append(f"{path} tiene {page.h1_count} H1")
        if path == "/":
            continue
        if not inbound[path]:
            (errors if is_editorial else warnings).append(f"página huérfana: {path}")
        elif depth.get(path, 99) > MAX_CLICK_DEPTH:
            (errors if is_editorial else warnings).append(f"{path} está a {depth.get(path, 'más de 99')} clics de la portada")
    for path in noindex:
        if path in sitemap_paths:
            errors.append(f"sitemap incluye página noindex: {path}")
    for path in sorted(sitemap_paths):
        if path not in pages:
            errors.append(f"sitemap apunta a una URL inexistente: {path}")

    return {
        "status": "blocked" if errors else "ok",
        "pages": len(pages),
        "indexable_pages": len(indexable),
        "editorial_pages": sorted(editorial_paths & set(pages)),
        "noindex_pages": len(noindex),
        "noindex_sample": noindex[:50],
        "sitemap_urls": sorted(sitemap_urls),
        "broken_links": broken,
        "orphans": sorted(path for path in indexable if path != "/" and not inbound[path]),
        "max_depth": max((depth.get(path, 0) for path in editorial_paths if path in depth), default=0),
        "inbound_counts": {path: len(inbound[path]) for path in sorted(editorial_paths) if path in inbound},
        "errors": errors,
        "warnings": warnings,
    }
