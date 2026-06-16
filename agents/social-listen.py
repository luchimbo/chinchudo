import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _log import get_logger  # noqa: E402

log = get_logger("social-listen")
DATA_DIR = ROOT / "data"
REPORTS_DIR = ROOT / "reports"
INTAKE_PATH = DATA_DIR / "social-listen-intake.jsonl"

browser_path = Path(__file__).resolve().parent / "browser-cdp.py"
spec = importlib.util.spec_from_file_location("browser_cdp", browser_path)
browser_cdp = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(browser_cdp)
browser_cdp.load_env()  # carga .env antes de cualquier llamada a Dolphin

TECHNICAL_KEYWORDS = [
    "driver", "compatib", "instalar", "instala", "funciona", "funcionar",
    "conectar", "puerto", "reconoce", "detecta", "hz", "latencia",
    "midi controller", "midi keyboard", "midi interface", "midi input",
    "software", "plugin", "daw", "error", "configurar", "configuracion",
    "configuración", "no suena", "no funciona", "no reconoce",
    "windows", "mac", "usb", "bluetooth", "asio", "audio interface",
]
PURCHASE_KEYWORDS = [
    "comprar", "comprarlo", "donde consigo", "consigo", "donde compro",
    "envío", "envio", "delivery", "conviene", "vale la pena", "lo venden",
    "disponible", "stock",
]
PRICE_KEYWORDS = [
    "precio", "cuánto", "cuanto", "cuanto sale", "cuánto sale",
    "costo", "cuesta", "cuánto cuesta", "cuanto cuesta",
]
WARRANTY_KEYWORDS = [
    "garantía", "garantia", "devolución", "devolucion", "cambio",
    "roto", "falla", "fallo", "service", "posventa", "trae garantia",
]
COMPARISON_KEYWORDS = [
    " vs ", " versus ", "diferencia entre", "mejor que", "comparar",
    "comparacion", "comparación", "cual conviene", "cuál conviene",
]

# Keywords de dominio: si ninguno aparece en texto+título, el ítem es off-topic para este proyecto
DOMAIN_KEYWORDS = [
    "midiplus", "kressmer",
    "midi controller", "midi keyboard", "midi interface", "midi input",
    "midi device", "midi driver", "midi usb", "midi service",
    "controlador midi", "teclado midi", "teclado controlador",
    "controlador musical", "interfaz midi", "piano midi",
    " midi ", "midi\n",
    "drum pad", "drum machine", "audio interface",
    "daw ", " daw", "ableton", "fl studio", "logic pro", "garageband", "reaper",
    "produccion musical", "produccion de musica", "music production", "home studio",
    "beat maker", "beatmaker", "sampler", "synthesizer", "synth ",
    "vst plugin", "audio plugin", "asio driver",
    "grabacion", "grabación", "home recording",
    "estudio casero", "estudio en casa", "grabar en casa",
    "hacer beats", "producir musica", "componer en casa",
    # Competidores — conversaciones donde se puede recomendar MidiPlus/Kressmer
    "arturia", "minilab", "akai mpk", "novation launchpad", "novation ",
    "m-audio", "alesis ", "focusrite", "presonus",
    # Pianos y teclados digitales
    "piano digital", "piano electrico", "piano electronico",
    "digital piano", "electric piano", "electronic keyboard",
    "teclado digital", "teclado electronico", "teclado musical",
    "teclado principiante", "teclado para aprender",
    "weighted keys", "teclas ponderadas", "teclas semiponderadas",
    "portable keyboard", "teclado portátil",
    "stage piano", "workstation keyboard", "arranger keyboard",
    "piano casio", "piano yamaha", "piano roland",
    "casio ct-", "casio cdp", "casio px", "casio wk",
    "yamaha psr", "yamaha p-", "yamaha ydp",
    "roland fp-", "roland rd-", "roland go:",
    "korg b2", "korg sp-", "korg pa",
    "aprender piano", "clases de piano", "tocar el piano",
    "piano para niños", "piano para principiantes",
]

DOMAIN_EXCLUSIONS = [
    "midi skirt", "midi dress", "midi length", "mini midi", "midi hem",
    "midi top", "midi coat", "midi pleated", "midi bodycon",
    "piano bar", "piano bar restaurant",
]


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def write_report(name: str, data: dict) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"{utc_stamp()}-listen-{name}.json"
    path.write_text(json.dumps({"timestamp_utc": utc_stamp(), **data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def append_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def is_on_topic(item: dict, query: str = "") -> bool:
    # La query con la que se encontró el ítem se incluye en el contexto:
    # si buscamos "controlador midi" y el comentario dice "lo quiero!" sigue siendo on-topic.
    combined = (
        " " + query + " " +
        (item.get("context") or "") + " " +
        (item.get("title") or "") + " " +
        (item.get("videoTitle") or "") +
        " "
    ).lower()
    if any(exc in combined for exc in DOMAIN_EXCLUSIONS):
        return False
    return any(kw in combined for kw in DOMAIN_KEYWORDS)


# Detección de idioma: por ahora solo operamos en Argentina / español.
# Heurística por palabras función (no por términos técnicos, que son iguales en ambos idiomas).
_ENGLISH_STOPWORDS = {
    "the", "and", "is", "are", "you", "your", "with", "for", "this", "that",
    "have", "has", "had", "was", "were", "what", "how", "does", "doesn", "don",
    "my", "of", "to", "on", "in", "not", "but", "just", "like", "so", "would",
    "could", "should", "get", "got", "there", "they", "their", "he", "she", "we",
    "can", "about", "from", "if", "when", "which", "i", "it", "im", "ive", "youre",
    "really", "very", "much", "thanks", "thank", "please", "help", "need", "want",
    "use", "using", "work", "works", "working", "still", "also", "because",
}
_SPANISH_STOPWORDS = {
    "que", "de", "la", "el", "en", "con", "para", "una", "uno", "los", "las",
    "es", "por", "mi", "tu", "te", "se", "su", "lo", "yo", "muy", "pero", "como",
    "mas", "esta", "este", "esto", "hay", "ya", "si", "cuando", "cual", "porque",
    "tengo", "tiene", "hace", "desde", "entre", "sobre", "tambien", "del", "al",
    "un", "me", "le", "nos", "vos", "ustedes", "ser", "estar", "donde", "quien",
}
_SPANISH_CHARS = set("áéíóúñ¿¡ü")
_WORD_RE = re.compile(r"[a-záéíóúñü]+", re.IGNORECASE)


def is_spanish(text: str) -> bool:
    """True si el texto parece español (o es ambiguo/corto). False si es claramente inglés."""
    if not text:
        return True  # sin texto: no descartar por idioma
    lower = text.lower()
    # Cualquier carácter típico del español es señal fuerte (el inglés no los usa)
    if any(ch in _SPANISH_CHARS for ch in lower):
        return True
    tokens = _WORD_RE.findall(lower)
    if not tokens:
        return True
    eng = sum(1 for t in tokens if t in _ENGLISH_STOPWORDS)
    spa = sum(1 for t in tokens if t in _SPANISH_STOPWORDS)
    # Claramente inglés: varias stopwords inglesas y predominan sobre las españolas
    if eng >= 3 and eng > spa:
        return False
    return True


def classify_intent(text: str) -> str:
    lower = text.lower()
    if any(kw in lower for kw in TECHNICAL_KEYWORDS):
        return "TECHNICAL_QUESTION"
    if any(kw in lower for kw in WARRANTY_KEYWORDS):
        return "WARRANTY_QUESTION"
    if any(kw in lower for kw in PRICE_KEYWORDS):
        return "PRICE_QUESTION"
    if any(kw in lower for kw in PURCHASE_KEYWORDS):
        return "PURCHASE_QUESTION"
    if any(kw in lower for kw in COMPARISON_KEYWORDS):
        return "COMPARISON"
    return "GENERAL_DISCUSSION"


def classify_priority(intent: str, text: str) -> str:
    if intent in ("PURCHASE_QUESTION", "TECHNICAL_QUESTION"):
        return "HIGH"
    if intent in ("WARRANTY_QUESTION", "PRICE_QUESTION", "COMPARISON"):
        return "MEDIUM"
    return "LOW"


_COMMENT_TYPES = {"instagram_comment", "facebook_comment", "tiktok_comment"}

def is_actionable(text: str, intent: str, source_type: str = "") -> tuple[bool, str]:
    is_comment = source_type in _COMMENT_TYPES

    if is_comment:
        # Comentarios de redes: mucho ruido ("🔥", "@amigo mira", "lo quiero!").
        # Solo pasa si tiene pregunta, keyword de valor, o es un comentario largo (discusión real).
        has_question   = "?" in text
        has_keyword    = intent != "GENERAL_DISCUSSION"   # técnico, precio, compra, garantía, comparación
        is_substantial = len(text) >= 80                  # texto largo = opinión o relato real
        # Descartar si es solo emojis / tags / reacciones cortas
        words = [w for w in text.split() if w.isalpha() or "'" in w]
        has_real_words = len(words) >= 4
        if not has_real_words:
            return False, "comentario_sin_texto_real"
        if not (has_question or has_keyword or is_substantial):
            return False, "comentario_sin_valor"
        return True, ""

    # Posts / captions: filtro original
    if intent == "GENERAL_DISCUSSION" and "?" not in text and len(text) < 40:
        return False, "elogio_o_texto_corto_sin_pregunta"
    return True, ""


def parse_age_months(published_time: str) -> int | None:
    lower = published_time.lower()
    # ISO 8601 timestamp (e.g. "2024-01-11T16:08:24.000Z")
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", lower)
    if m:
        try:
            pub = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), tzinfo=timezone.utc)
            delta_days = (datetime.now(timezone.utc) - pub).days
            return max(0, delta_days // 30)
        except Exception:
            pass
    m = re.search(r"(\d+)\s*(año|años|year|years)", lower)
    if m:
        return int(m.group(1)) * 12
    m = re.search(r"(\d+)\s*(mes|meses|month|months)", lower)
    if m:
        return int(m.group(1))
    m = re.search(r"(\d+)\s*(semana|semanas|week|weeks)", lower)
    if m:
        return max(1, (int(m.group(1)) * 7) // 30)
    return None


def is_too_old(published_time: str, max_months: int = 6) -> bool:
    age = parse_age_months(published_time)
    return age is not None and age > max_months


def normalize_item(channel: str, query: str, item: dict, account: str | None, source_id: str | None = None) -> dict:
    text = item.get("context") or item.get("title") or ""
    source_type = item.get("sourceType") or f"{channel}_search_result"
    intent = classify_intent(text)
    notes = "Detectada por social-listen; requiere revision humana antes de responder."
    if source_type == "youtube_comment":
        notes = f"Comentario de YouTube detectado por social-listen. Video: {item.get('videoTitle', '')[:180]}. Requiere revision humana antes de responder."
    elif source_type in ("reddit_comment", "reddit_post"):
        notes = f"{'Comentario' if source_type == 'reddit_comment' else 'Post'} de Reddit en hilo: {item.get('videoTitle', '')[:180]}. Requiere revision humana antes de responder."
    elif source_type == "facebook_post":
        notes = f"Post de Facebook detectado por social-listen. Requiere revision humana antes de responder."
    elif source_type == "instagram_post":
        notes = f"Post de Instagram detectado por social-listen. Requiere revision humana antes de responder."
    elif source_type == "x_post":
        notes = f"Post de X (Twitter) detectado por social-listen. Requiere revision humana antes de responder."
    return {
        "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        "channel": channel,
        "query": query,
        "account": account or "default",
        "sourceUrl": item.get("url", ""),
        "sourceAuthor": item.get("author", ""),
        "sourceText": text[:4000],
        "sourceTitle": item.get("title", ""),
        "sourceType": source_type,
        "videoUrl": item.get("videoUrl", ""),
        "publishedTime": item.get("publishedTime", ""),
        "detectedIntent": intent,
        "priority": classify_priority(intent, text),
        "status": "NEW",
        "notes": notes,
        "language": "es" if is_spanish(text) else "en",
        "monitoredSourceId": source_id or "",
    }


def run_listen(channel: str, query: str, limit: int, dry_run: bool, account: str | None, source_id: str | None = None) -> dict:
    log.info("listen_start", channel=channel, account=account or "default", query=query[:60], limit=limit, dry_run=dry_run)
    try:
        ws_url = browser_cdp.get_page_ws_url(account)
    except Exception as exc:
        log.error("listen_browser_connect_fail", channel=channel, account=account or "default", error=str(exc))
        return {
            "command": "listen", "channel": channel, "account": account or "default",
            "query": query, "limit": limit, "dry_run": dry_run,
            "error": f"No se pudo conectar al browser: {exc}",
            "items_read": 0, "intake_rows": 0, "discarded_count": 0,
            "discard_reasons": {}, "discarded_sample": [], "intake_path": str(INTAKE_PATH), "sample": [],
        }

    try:
        with browser_cdp.CDPClient(ws_url, timeout=40.0) as client:
            client.send("Page.enable")
            client.send("Runtime.enable")
            if channel == "youtube":
                items = browser_cdp.extract_youtube_comment_items(client, query, limit)
            elif channel == "reddit":
                items = browser_cdp.extract_reddit_comment_items(client, query, limit)
            elif channel == "facebook":
                items = browser_cdp.extract_facebook_post_items(client, query, limit)
            elif channel == "instagram":
                items = browser_cdp.extract_instagram_post_items(client, query, limit)
            elif channel == "x":
                items = browser_cdp.extract_x_post_items(client, query, limit)
            elif channel == "tiktok":
                items = browser_cdp.extract_tiktok_items(client, query, limit)
            elif channel == "linkedin":
                items = browser_cdp.extract_linkedin_items(client, query, limit)
            else:
                url = browser_cdp.search_url_for(channel, query)
                client.send("Page.navigate", {"url": url})
                import time
                time.sleep(5)
                items = browser_cdp.extract_visible_items(client, channel, limit)
    except Exception as exc:
        import traceback
        log.error("listen_cdp_error", channel=channel, account=account or "default", error=str(exc))
        return {
            "command": "listen", "channel": channel, "account": account or "default",
            "query": query, "limit": limit, "dry_run": dry_run,
            "error": f"Error CDP durante extracción ({channel}): {exc}",
            "traceback": traceback.format_exc()[-800:],
            "items_read": 0, "intake_rows": 0, "discarded_count": 0,
            "discard_reasons": {}, "discarded_sample": [], "intake_path": str(INTAKE_PATH), "sample": [],
        }

    rows: list[dict] = []
    discarded: list[dict] = []

    for item in items:
        if not item.get("url"):
            discarded.append({"reason": "sin_url", "text": (item.get("context") or "")[:60]})
            continue
        if not is_on_topic(item, query=query):
            discarded.append({"reason": "fuera_de_tema", "text": (item.get("context") or item.get("title") or "")[:60]})
            continue
        lang_text = (item.get("context") or item.get("title") or item.get("videoTitle") or "")
        if not is_spanish(lang_text):
            discarded.append({"reason": "idioma_no_es", "text": lang_text[:60]})
            continue
        published = item.get("publishedTime", "")
        max_age = 18 if channel in ("x", "instagram") else 24
        if is_too_old(published, max_months=max_age):
            discarded.append({"reason": "comentario_viejo", "age": published, "text": (item.get("context") or "")[:60]})
            continue
        row = normalize_item(channel, query, item, account, source_id)
        ok, reason = is_actionable(row["sourceText"], row["detectedIntent"], row.get("sourceType", ""))
        if not ok:
            discarded.append({"reason": reason, "text": row["sourceText"][:60]})
            continue
        rows.append(row)

    if rows and not dry_run:
        append_jsonl(INTAKE_PATH, rows)

    discard_summary: dict[str, int] = {}
    for d in discarded:
        discard_summary[d["reason"]] = discard_summary.get(d["reason"], 0) + 1

    log.info(
        "listen_done",
        channel=channel,
        account=account or "default",
        items_read=len(items),
        intake_rows=len(rows),
        discarded=len(discarded),
        discard_reasons=discard_summary,
        dry_run=dry_run,
    )

    summary = {
        "command": "listen",
        "channel": channel,
        "account": account or "default",
        "query": query,
        "limit": limit,
        "dry_run": dry_run,
        "items_read": len(items),
        "intake_rows": len(rows),
        "discarded_count": len(discarded),
        "discard_reasons": discard_summary,
        "discarded_sample": discarded[:5],
        "intake_path": str(INTAKE_PATH),
        "sample": rows[:3],
    }
    report = write_report("run", summary)
    summary["report"] = str(report)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Escucha semi-automatica y normaliza oportunidades")
    parser.add_argument("--channel", default="youtube", choices=sorted(browser_cdp.SEARCH_URLS))
    parser.add_argument("--account", default="")
    parser.add_argument("--query", default="MidiPlus controlador MIDI home studio")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--source-id", default="")
    args = parser.parse_args()

    summary = run_listen(args.channel, args.query, args.limit, args.dry_run, args.account or None, args.source_id or None)
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
