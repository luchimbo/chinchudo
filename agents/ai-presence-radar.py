#!/usr/bin/env python3
"""
Agente de presencia en IAs: Radar de redes sociales.

Responsabilidades:
- Escuchar todos los canales monitoreados activos usando social-listen.py.
- Puntuar cada comentario/video encontrado con un modelo de IA (relevancia 0-100).
- Detectar intención, marca, prioridad y razonamiento.
- Guardar resultados en data/ai-presence-social.jsonl para importación a Prisma.
- Ordenar resultados por relevanceScore descendente.

Uso:
    python agents/ai-presence-radar.py [--limit N] [--dry-run] [--models m1,m2]
    python agents/ai-presence-radar.py status
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "agents"))

from _log import get_logger  # noqa: E402

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except Exception:
    pass

log = get_logger("ai-presence-radar")

DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
SOCIAL_LISTEN = ROOT / "agents" / "social-listen.py"
LIST_SOURCES = ROOT / "scripts" / "list-monitored-sources.mjs"
INTAKE_PATH = DATA_DIR / "ai-presence-social.jsonl"

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "openai/gpt-4o-mini"

# Queries de respaldo si no hay fuentes monitoreadas activas
DEFAULT_QUERIES = [
    ("youtube", "MidiPlus controlador MIDI"),
    ("youtube", "Kressmer bateria electronica"),
    ("tiktok", "controlador midi"),
    ("tiktok", "teclado midi comprar"),
    ("reddit", "controlador MIDI Argentina"),
    ("reddit", "home studio MIDI"),
    ("instagram", "midiplus"),
    ("instagram", "kressmer"),
    ("x", "midiplus"),
    ("x", "kressmer"),
]

BRAND_PATTERNS = [
    r"pc\s*midi\s*center",
    r"pc\s*midi",
    r"pcmidi",
    r"pcmidicenter",
    r"midiplus",
    r"kressmer",
]

COMPETITORS = [
    "arturia", "minilab", "akai mpk", "novation launchpad", "novation",
    "m-audio", "alesis", "focusrite", "presonus", "behringer", "nektar",
    "musimundo", "parquer", "mercado libre", "mercadolibre", "guitarras quezada",
    "quezada", "ferchordsound", "ferchor", "audiomusica", "audio musica",
    "guitar center", "sweetwater", "thomann", "amazon", "aliexpress", "ebay",
    "baires audio", "baires-audio", "backstage", "casa del musico", "el musico",
    "zipppo", "zippo music", "roland", "yamaha", "korg", "casio",
]


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def write_report(name: str, data: dict) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"{utc_stamp()}-ai-presence-{name}.json"
    payload = {"timestamp_utc": utc_stamp(), **data}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def append_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def list_active_sources() -> list[dict]:
    """Lee fuentes monitoreadas activas desde Prisma vía list-monitored-sources.mjs."""
    result = subprocess.run(
        [sys.executable, "-m", "node", str(LIST_SOURCES)] if False else ["node", str(LIST_SOURCES)],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        log.warning("ai_presence_sources_list_failed", error=result.stderr.strip())
        return []
    out = result.stdout.strip()
    line = out.splitlines()[-1] if out else "[]"
    try:
        return json.loads(line)
    except Exception as exc:
        log.warning("ai_presence_sources_parse_failed", error=str(exc))
        return []


def resolve_default_sources() -> list[dict]:
    sources = []
    for channel, query in DEFAULT_QUERIES:
        sources.append({
            "id": f"default-{channel}-{query.replace(' ', '-').lower()}",
            "label": f"default-{channel}-{query}",
            "channel": channel,
            "query": query,
            "account": "",
            "limit": 5,
            "clientId": "",
            "clientSlug": "",
        })
    return sources


def run_social_listen(source: dict) -> list[dict]:
    command = [
        sys.executable, str(SOCIAL_LISTEN),
        "--channel", source["channel"],
        "--query", source["query"],
        "--limit", str(source.get("limit", 5)),
        "--language", "es",
        "--output-json",
        "--dry-run",  # no escribimos en el intake general de oportunidades
    ]
    if source.get("account"):
        command.extend(["--account", source["account"]])
    if source.get("source_id"):
        command.extend(["--source-id", source["source_id"]])
    if source.get("clientId"):
        command.extend(["--client-id", source["clientId"]])

    log.info("ai_presence_listen_start", channel=source["channel"], query=source["query"][:60])
    result = subprocess.run(
        command, cwd=ROOT, capture_output=True, text=True, timeout=300,
    )
    if result.returncode != 0:
        log.error("ai_presence_listen_failed", channel=source["channel"], error=result.stderr.strip())
        return []

    try:
        # social-listen.py --output-json imprime {"rows": [...], "summary": {...}}
        data = json.loads(result.stdout.strip().splitlines()[-1])
        return data.get("rows", []) if isinstance(data, dict) else []
    except Exception as exc:
        log.error("ai_presence_listen_parse_failed", channel=source["channel"], error=str(exc))
        return []


def query_openrouter(model: str, prompt: str, api_key: str) -> dict:
    try:
        import openai
    except ImportError:
        raise SystemExit("ai-presence-radar: necesitas instalar openai: pip install openai")

    client = openai.OpenAI(api_key=api_key, base_url=OPENROUTER_BASE_URL)
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1200,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        text = completion.choices[0].message.content or ""
        return {"ok": True, "text": text, "error": None}
    except Exception as e:
        return {"ok": False, "text": "", "error": str(e)}


def build_scoring_prompt(items: list[dict]) -> str:
    item_texts = []
    for idx, item in enumerate(items):
        item_texts.append(
            f"ITEM {idx + 1}\n"
            f"Canal: {item.get('channel', '')}\n"
            f"Query: {item.get('query', '')}\n"
            f"Autor: {item.get('sourceAuthor', '')}\n"
            f"Texto: {item.get('sourceText', '')[:800]}\n"
            f"Título video: {item.get('videoTitle', '') or item.get('sourceTitle', '')}\n"
        )

    return (
        "Sos un analista de inteligencia comercial para PC MIDI Center, una tienda de instrumentos musicales, "
        "controladores MIDI, interfaces de audio, baterías electrónicas y home studio en Argentina. "
        "Marcas propias: PC MIDI Center, MidiPlus, Kressmer. Competidores comunes: Arturia, Akai, Novation, "
        "M-Audio, Alesis, Focusrite, Presonus, Roland, Yamaha, Korg, Casio, etc.\n\n"
        "Evaluá cada ITEM según relevancia comercial para PC MIDI Center. Devolvé ÚNICAMENTE un JSON válido "
        "con esta estructura exacta:\n"
        "{ \"results\": [\n"
        "  {\n"
        "    \"item_index\": 1,\n"
        "    \"relevanceScore\": 0-100,\n"
        "    \"intent\": \"PURCHASE_QUESTION\" | \"TECHNICAL_QUESTION\" | \"PRICE_QUESTION\" | \"WARRANTY_QUESTION\" | \"COMPARISON\" | \"COMPETITOR_MENTION\" | \"BRAND_MENTION\" | \"RECOMMENDATION\" | \"GENERAL_DISCUSSION\",\n"
        "    \"brandDetected\": \"PC MIDI Center\" | \"MidiPlus\" | \"Kressmer\" | \"Competidor\" | \"Ninguna\",\n"
        "    \"priority\": \"LOW\" | \"MEDIUM\" | \"HIGH\" | \"URGENT\",\n"
        "    \"aiReasoning\": \"una frase corta justificando la puntuación\"\n"
        "  }\n"
        "] }\n\n"
        "Criterios para relevanceScore:\n"
        "- 90-100: menciona directamente PC MIDI Center, MidiPlus o Kressmer con intención de compra o consulta técnica que se puede resolver.\n"
        "- 70-89: menciona competidor claro con intención de compra; oportunidad de recomendar.\n"
        "- 40-69: pregunta técnica o comparativa genérica del rubro sin marca definida.\n"
        "- 10-39: conversación general del rubro, poco actionable.\n"
        "- 0-9: off-topic o spam.\n\n"
        "No inventes stock, precios ni disponibilidad. Respondé solo con el JSON.\n\n"
        + "\n".join(item_texts)
    )


def score_items(items: list[dict], model: str, api_key: str) -> list[dict]:
    if not items:
        return []

    prompt = build_scoring_prompt(items)
    response = query_openrouter(model, prompt, api_key)
    if not response["ok"]:
        log.error("ai_presence_scoring_failed", error=response["error"])
        return []

    try:
        parsed = json.loads(response["text"])
        scores = parsed.get("results", [])
    except Exception as exc:
        log.error("ai_presence_scoring_parse_failed", error=str(exc), text=response["text"][:200])
        return []

    results = []
    for score in scores:
        idx = score.get("item_index", 0)
        if idx < 1 or idx > len(items):
            continue
        item = items[idx - 1]
        results.append({
            "timestamp_utc": utc_stamp(),
            "clientId": item.get("clientId", ""),
            "sourceType": "SOCIAL_COMMENT" if "comment" in (item.get("sourceType") or "") else "SOCIAL_POST",
            "channel": item.get("channel", ""),
            "query": item.get("query", ""),
            "sourceUrl": item.get("sourceUrl", ""),
            "videoUrl": item.get("videoUrl", ""),
            "videoTitle": item.get("videoTitle", ""),
            "author": item.get("sourceAuthor", ""),
            "context": item.get("sourceText", ""),
            "relevanceScore": max(0, min(100, float(score.get("relevanceScore", 0)))),
            "brandDetected": score.get("brandDetected", ""),
            "intent": score.get("intent", "GENERAL_DISCUSSION"),
            "priority": score.get("priority", "MEDIUM"),
            "aiReasoning": score.get("aiReasoning", ""),
            "modelUsed": model,
            "metadata": {
                "sourceType": item.get("sourceType", ""),
                "publishedTime": item.get("publishedTime", ""),
                "language": item.get("language", ""),
            },
        })
    return results


def run_radar(args: argparse.Namespace) -> None:
    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("ai-presence-radar: falta OPENROUTER_API_KEY en .env")

    model = args.model or os.getenv("OPENROUTER_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL

    sources = list_active_sources()
    if not sources:
        log.info("ai_presence_no_monitored_sources", message="No hay fuentes monitoreadas activas; usando queries por defecto")
        sources = resolve_default_sources()

    print(f"ai-presence-radar: {len(sources)} fuentes a escanear")

    if args.dry_run:
        print("ai-presence-radar: modo dry-run — no se guardaran datos")

    all_results: list[dict] = []
    errors: list[dict] = []
    batch_size = 8

    for source in sources:
        rows = run_social_listen(source)
        if not rows:
            continue

        print(f"  [{source['channel']}] {len(rows)} items encontrados para query '{source['query'][:50]}'")

        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            try:
                scored = score_items(batch, model, api_key)
                if args.dry_run:
                    for r in scored:
                        print(f"    score={r['relevanceScore']:05.1f} intent={r['intent']} brand={r['brandDetected']} | {r['context'][:80]}...")
                all_results.extend(scored)
            except Exception as exc:
                log.error("ai_presence_batch_error", channel=source["channel"], error=str(exc))
                errors.append({"channel": source["channel"], "error": str(exc)})

    # Ordenar por relevanceScore descendente
    all_results.sort(key=lambda r: r["relevanceScore"], reverse=True)

    if not args.dry_run and all_results:
        INTAKE_PATH.write_text("", encoding="utf-8")
        append_jsonl(INTAKE_PATH, all_results)
        print(f"ai-presence-radar: {len(all_results)} resultados guardados en {INTAKE_PATH}")

    report_data = {
        "command": "ai-presence-radar",
        "status": "ok",
        "dry_run": args.dry_run,
        "model": model,
        "sources": len(sources),
        "results_total": len(all_results),
        "errors": errors,
        "top_10": all_results[:10],
    }
    report_path = write_report("radar", report_data)
    print(f"ai-presence-radar: reporte en {report_path}")


def run_status(_args: argparse.Namespace) -> None:
    if not INTAKE_PATH.exists():
        print("ai-presence-radar: no hay resultados previos en", INTAKE_PATH)
        return

    entries = []
    with open(INTAKE_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                entries.append(json.loads(line))

    if not entries:
        print("ai-presence-radar: archivo vacio")
        return

    total = len(entries)
    scores = [e["relevanceScore"] for e in entries]
    avg = round(sum(scores) / len(scores), 2) if scores else 0
    by_channel = {}
    for e in entries:
        ch = e.get("channel", "unknown")
        by_channel[ch] = by_channel.get(ch, 0) + 1

    print(f"ai-presence-radar status:")
    print(f"  total resultados : {total}")
    print(f"  score promedio   : {avg}/100")
    print(f"  top score        : {max(scores) if scores else 0}")
    print(f"  por canal        : {by_channel}")
    print(f"  ultimo corrida   : {max(e['timestamp_utc'] for e in entries)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Agente de presencia en IAs: Radar de redes sociales")
    sub = parser.add_subparsers(dest="subcommand", required=True)

    radar_p = sub.add_parser("radar", help="Ejecutar ciclo completo de búsqueda y scoring")
    radar_p.add_argument("--limit", type=int, default=0, help="Limite por fuente (0=usar default de fuente)")
    radar_p.add_argument("--dry-run", action="store_true", help="Consulta APIs pero no escribe datos")
    radar_p.add_argument("--model", default=DEFAULT_MODEL, help="Modelo de IA para scoring")

    sub.add_parser("status", help="Mostrar resumen del ultimo radar")

    parser.add_argument("--client-slug", default="", help="Cliente a procesar (default: pcmidi)")
    args = parser.parse_args()

    client_slug = getattr(args, "client_slug", "") or "pcmidi"
    try:
        import db_pg
        db_pg.inject_openrouter_env(client_slug=client_slug or None)
    except Exception as e:
        log.warning("ai_presence_client_env_failed", error=str(e))

    if args.subcommand == "radar":
        run_radar(args)
    elif args.subcommand == "status":
        run_status(args)


if __name__ == "__main__":
    main()
