"""Generador de sitio estatico para landing pages."""

import sqlite3
from pathlib import Path

import markdown

from authority_swarm.config import ROOT

DB_PATH = ROOT / "data" / "app.db"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_all_landings() -> list[dict]:
    """Consulta SQLite y devuelve todas las landing pages."""
    conn = _connect()
    try:
        rows = conn.execute("SELECT * FROM landing_pages ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def markdown_to_html(md_text: str) -> str:
    """Convierte Markdown a HTML con soporte para tablas y fenced code."""
    return markdown.markdown(md_text, extensions=["tables", "fenced_code"])


def _status_class(status: str) -> str:
    mapping = {
        "draft": "status-draft",
        "reviewed": "status-reviewed",
        "approved": "status-approved",
        "published": "status-published",
        "rejected": "status-rejected",
    }
    return mapping.get(status, "status-draft")


def _header() -> str:
    return """<header class="site-header">
  <div class="site-header-inner">
    <a href="index.html" class="site-brand">PC<span>MIDI</span> Center</a>
    <nav class="site-nav">
      <a href="index.html">Landings</a>
    </nav>
  </div>
</header>"""


def _footer() -> str:
    return """<footer class="site-footer">
  <div class="site-footer-inner">
    <p>Landing pages generadas por PC MIDI Center &middot; <a href="https://www.pcmidi.com.ar/" target="_blank" rel="noopener">www.pcmidi.com.ar</a></p>
  </div>
</footer>"""


def render_page(title: str, body_html: str, back_to_index: bool = False) -> str:
    """Devuelve un documento HTML completo con el contenido dado."""
    # Ajustar rutas según si es index o landing individual
    css_path = "styles.css"
    index_path = "index.html"
    if back_to_index:
        css_path = "../styles.css"
        index_path = "../index.html"

    nav = f'<a href="{index_path}" class="nav-back">&larr; Volver al listado</a>' if back_to_index else ""

    header = _header().replace('href="index.html"', f'href="{index_path}"')

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{css_path}">
</head>
<body>
{header}
<main class="container">
{nav}
{body_html}
</main>
{_footer()}
</body>
</html>
"""


def build_web(output_dir: Path = ROOT / "outputs" / "web") -> None:
    """Genera el sitio estatico completo."""
    landings_dir = output_dir / "landings"
    output_dir.mkdir(parents=True, exist_ok=True)
    landings_dir.mkdir(parents=True, exist_ok=True)

    landings = load_all_landings()

    for landing in landings:
        landing_id = landing["id"]
        slug = landing["slug"]
        title = landing["title"]
        md_content = landing["markdown"]

        body_html = markdown_to_html(md_content)
        html = render_page(title=title, body_html=body_html, back_to_index=True)

        filename = f"{landing_id}-{slug}.html"
        (landings_dir / filename).write_text(html, encoding="utf-8")

    # Generar index.html
    if landings:
        items = []
        for landing in landings:
            landing_id = landing["id"]
            slug = landing["slug"]
            title = landing["title"]
            status = landing["status"]
            created_at = landing["created_at"]
            status_cls = _status_class(status)
            # Acortar fecha si es ISO larga
            date_display = created_at
            if "T" in created_at:
                date_display = created_at.split("T")[0]
            items.append(
                f'<div class="landing-item">'
                f'<div class="landing-item-main">'
                f'<a href="landings/{landing_id}-{slug}.html" class="landing-item-title">{title}</a>'
                f'<div class="landing-item-meta">'
                f'<span class="status {status_cls}">{status}</span>'
                f'<span>&middot;</span>'
                f'<span>{date_display}</span>'
                f'</div>'
                f'</div>'
                f'</div>'
            )
        grid_html = "<div class=\"landing-grid\">\n" + "\n".join(items) + "\n</div>"
    else:
        grid_html = '<div class="card"><p>No hay landing pages generadas todavia.</p></div>'

    index_body = f"""<div class="hero">
<h1>Landing Pages</h1>
<p>Listado completo de landing pages generadas para PC MIDI Center.</p>
</div>
{grid_html}
"""
    index_html = render_page(title="Landing Pages - PC MIDI Center", body_html=index_body)
    (output_dir / "index.html").write_text(index_html, encoding="utf-8")

    # Copiar styles.css
    css_source = Path(__file__).with_name("styles.css")
    css_target = output_dir / "styles.css"
    if css_source.exists():
        css_target.write_text(css_source.read_text(encoding="utf-8"), encoding="utf-8")
