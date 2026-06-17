import typer
from rich.console import Console

from authority_swarm.config import ensure_dirs
from authority_swarm.db import init_db

app = typer.Typer(help="PC MIDI Center Landing PMV: investigacion y landings con CTA a la tienda.")
console = Console()


@app.command()
def init() -> None:
    """Crea carpetas y base SQLite."""
    ensure_dirs()
    init_db()
    console.print("[green]Proyecto inicializado.[/green]")


@app.command("ingest-docs")
def ingest_docs_command() -> None:
    """Carga documentos Markdown de docs/ en la base local."""
    from authority_swarm.rag.ingest import ingest_docs

    ensure_dirs()
    init_db()
    count = ingest_docs()
    console.print(f"[green]Documentos ingeridos:[/green] {count} chunks")


@app.command("ig-login")
def ig_login() -> None:
    """Abre navegador para iniciar sesion en Instagram manualmente."""
    from authority_swarm.sources.playwright_extractor import login_instagram

    ensure_dirs()
    login_instagram()
    console.print("[green]Sesion de Instagram guardada.[/green]")


@app.command("run-landing-cycle")
def run_landing_cycle(
    topic: list[str] = typer.Option([], "--topic", "-t", help="Tema de landing. Repetible. Si se omite, usa temas por defecto."),
    topic_limit: int = typer.Option(2, "--topic-limit"),
    research_limit: int = typer.Option(6, "--research-limit"),
    review: bool = typer.Option(True, "--review/--no-review"),
) -> None:
    """Investiga necesidades reales y genera landing pages con CTA a pcmidi.com.ar."""
    from authority_swarm.landing.workflow import run_landing_cycle as run_cycle

    ensure_dirs()
    init_db()
    report = run_cycle(topics=topic or None, topic_limit=topic_limit, research_limit=research_limit, review=review)
    console.print(f"[green]Reporte de landings:[/green] {report}")


@app.command("list-landings")
def list_landings(status: str = "draft", limit: int = 20) -> None:
    """Genera un reporte de landing pages por estado."""
    from authority_swarm.landing.workflow import list_landings as list_pages

    ensure_dirs()
    init_db()
    report = list_pages(status=status, limit=limit)
    console.print(f"[green]Reporte de landings:[/green] {report}")


@app.command("mark-landing-status")
def mark_landing_status(landing_id: int, status: str) -> None:
    """Marca manualmente el estado de una landing. No publica contenido."""
    from authority_swarm.landing.workflow import mark_landing_status as mark_status

    init_db()
    updated = mark_status(landing_id=landing_id, status=status)
    if updated:
        console.print(f"[green]Landing {landing_id} actualizada a {status}.[/green]")
    else:
        console.print(f"[yellow]No se encontro landing {landing_id}.[/yellow]")


@app.command("build-web")
def build_web_command(
    output_dir: str = typer.Option("outputs/web", "--output", "-o", help="Carpeta de salida para el sitio HTML")
) -> None:
    """Genera un sitio web estatico con todas las landing pages."""
    from authority_swarm.web.builder import build_web
    from pathlib import Path

    ensure_dirs()
    init_db()
    build_web(Path(output_dir))
    console.print(f"[green]Sitio web generado en:[/green] {output_dir}")
    console.print("[dim]Abri index.html con doble click para ver el resultado.[/dim]")


@app.command("serve")
def serve_command(
    host: str = typer.Option("127.0.0.1", "--host", "-h", help="Host para el servidor"),
    port: int = typer.Option(8000, "--port", "-p", help="Puerto para el servidor"),
    reload: bool = typer.Option(False, "--reload", help="Recarga automatica en desarrollo"),
) -> None:
    """Levanta el dashboard web interactivo."""
    import uvicorn

    ensure_dirs()
    init_db()
    console.print(f"[green]Dashboard disponible en:[/green] http://{host}:{port}")
    uvicorn.run(
        "authority_swarm.web_app.main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    app()
