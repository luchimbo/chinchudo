import argparse
import importlib.util
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

# Windows puede heredar una consola CP1252. La salida --output-json contiene
# texto de redes (incluidos emojis), por lo que debe ser siempre UTF-8.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from _log import get_logger  # noqa: E402
import listening_connectors  # noqa: E402

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
    # Baterías electrónicas: producto, partes, uso y posventa.
    "bateria electronica", "baterias electronicas", "bateria electrica",
    "electronic drum", "electronic drums", "e-drum", "e-drums",
    "parche de malla", "parches de malla", "mesh head", "mesh heads",
    "modulo de bateria", "drum module", "pad de bombo", "kick pad",
    "pad de redoblante", "snare pad", "pad de plato", "cymbal pad",
    "hi hat electronico", "charles electronico", "doble pedal",
    "millenium mps", "millenium electronic drum", "millenium bateria",
]

DOMAIN_EXCLUSIONS = [
    "midi skirt", "midi dress", "midi length", "mini midi", "midi hem",
    "midi top", "midi coat", "midi pleated", "midi bodycon",
    "piano bar", "piano bar restaurant",
]

# These are deliberately specific discovery aliases, not a copy of every
# search query.  The quota worker rotates broad terms (for reach), while this
# list decides whether a discovered post is genuinely in the client's domain.
# Keeping ambiguous one-word terms out avoids accepting results about typing,
# people with a matching surname, or unrelated products.
DISCOVERY_KEYWORD_ALIASES: dict[str, list[str]] = {
    "pcmidi": [
        "novation launchkey", "novation circuit", "launchkey", "circuit tracks",
        "akai mpk", "akai mpc", "mpk mini", "mpc key",
        "arturia minilab", "arturia keylab", "minilab", "keylab",
        "focusrite scarlett", "scarlett solo", "scarlett 2i2",
        "behringer umc", "behringer audio", "behringer interface",
        "korg minilogue", "korg microkorg", "korg volca",
        "drum machine", "drum pad", "sintetizador", "sampler",
        "placa de audio", "monitor de estudio", "microfono xlr",
    ],
    "jurispedia": [
        "consulta juridica", "consulta legal", "abogado laboral", "derecho laboral",
        "contrato de alquiler", "derecho de familia", "defensa del consumidor",
        "accidente de transito", "marca registrada", "obra social", "copropiedad",
        "me despidieron", "no me pagan", "trabajo en negro", "horas extras",
        "problema alquiler", "aumento alquiler", "carta documento", "consulta abogado",
        "me estafaron", "reclamo consumidor", "cuota alimentaria", "embargo sueldo",
        "deuda tarjeta", "divorcio tenencia", "sucesion herencia", "contrato laboral",
    ],
    "prestige-running": [
        "zapatillas running", "entrenamiento running", "correr 5k", "correr 10k",
        "media maraton", "trail running", "fascitis plantar", "rozaduras al correr",
        "ampollas al correr", "medias de compresion", "indumentaria running",
    ],
}


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


def load_client_rules(source_id: str | None = None, client_id: str | None = None, query: str = "") -> tuple[list[str], list[str]]:
    # Fallback default values (matching the hardcoded ones if nothing else is found)
    keywords = list(DOMAIN_KEYWORDS)
    exclusions = list(DOMAIN_EXCLUSIONS)

    try:
        from db_pg import connect
        with connect() as conn:
            row = None
            if source_id:
                row = conn.execute(
                    'SELECT c.slug, c."domainKeywords", c."domainExclusions" '
                    'FROM "Client" c '
                    'JOIN "MonitoredSource" ms ON ms."clientId" = c.id '
                    'WHERE ms.id = %s',
                    (source_id,)
                ).fetchone()
            elif client_id:
                row = conn.execute(
                    'SELECT slug, "domainKeywords", "domainExclusions" FROM "Client" WHERE id = %s',
                    (client_id,)
                ).fetchone()
            
            if not row and query:
                # Intenta matchear por query contra el slug/name del cliente o sus keywords
                clients = conn.execute('SELECT id, slug, "domainKeywords", "domainExclusions" FROM "Client" WHERE active = true').fetchall()
                # Si una de las keywords del cliente está en la query, elegimos ese
                q_lower = query.lower()
                for c in clients:
                    kws = json.loads(c["domainKeywords"])
                    if any(kw.lower() in q_lower for kw in kws):
                        row = c
                        break
                if not row and clients:
                    # Fallback al primer cliente activo
                    row = clients[0]

            if row:
                configured = json.loads(row["domainKeywords"])
                aliases = DISCOVERY_KEYWORD_ALIASES.get(str(row.get("slug", "")).lower(), [])
                keywords = list(dict.fromkeys([*configured, *aliases]))
                exclusions = json.loads(row["domainExclusions"])
    except Exception as exc:
        log.warning("listen_db_rules_load_failed", error=str(exc))

    return keywords, exclusions


def is_on_topic(item: dict, query: str, keywords: list[str], exclusions: list[str]) -> bool:
    import unicodedata
    # Query text is intentionally excluded: matching a broad search term must
    # not make an unrelated result (for example another product called
    # "Prestige") pass relevance validation.
    combined = (
        " " +
        (item.get("context") or "") + " " +
        (item.get("title") or "") + " " +
        (item.get("videoTitle") or "") +
        " "
    ).lower()

    # Normalizar diacríticos (eliminar acentos)
    normalized_combined = "".join(
        c for c in unicodedata.normalize("NFD", combined)
        if unicodedata.category(c) != "Mn"
    )

    for exc in exclusions:
        norm_exc = "".join(
            c for c in unicodedata.normalize("NFD", exc.lower())
            if unicodedata.category(c) != "Mn"
        )
        pattern = r"\b" + re.escape(norm_exc) + r"\b"
        if re.search(pattern, normalized_combined):
            return False

    for kw in keywords:
        norm_kw = "".join(
            c for c in unicodedata.normalize("NFD", kw.lower())
            if unicodedata.category(c) != "Mn"
        )
        pattern = r"\b" + re.escape(norm_kw) + r"\b"
        if re.search(pattern, normalized_combined):
            return True

    return False



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


_PORTUGUESE_CHARS = set("ãõçâêôà")


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


def detect_language(text: str) -> str:
    """Heuristica liviana para busquedas manuales: es/en/pt/other."""
    if not text:
        return "other"
    lower = text.lower()
    if any(ch in _PORTUGUESE_CHARS for ch in lower):
        return "pt"
    if any(ch in _SPANISH_CHARS for ch in lower):
        return "es"
    tokens = _WORD_RE.findall(lower)
    if not tokens:
        return "other"
    eng = sum(1 for t in tokens if t in _ENGLISH_STOPWORDS)
    spa = sum(1 for t in tokens if t in _SPANISH_STOPWORDS)
    pt_words = {
        "que", "de", "para", "uma", "com", "nao", "não", "voce", "você",
        "meu", "minha", "isso", "esse", "essa", "tambem", "também", "onde",
        "quanto", "funciona", "preciso", "comprar", "tem", "estou", "está",
    }
    por = sum(1 for t in tokens if t in pt_words)
    if por >= 2 and por >= spa and por >= eng:
        return "pt"
    if eng >= 3 and eng > spa:
        return "en"
    if spa >= 1:
        return "es"
    return "other"


def language_allowed(text: str, requested_language: str) -> tuple[bool, str]:
    detected = detect_language(text)
    requested = (requested_language or "es").lower()
    if requested == "any":
        return True, detected
    return detected == requested, detected


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
    normalized = text.lower()
    millenium_drum = "millenium" in normalized and any(term in normalized for term in ("bateria", "battery", "drum", "mps", "parche", "pad", "modulo"))
    if millenium_drum:
        return "HIGH"
    if intent in ("PURCHASE_QUESTION", "TECHNICAL_QUESTION"):
        return "HIGH"
    if intent in ("WARRANTY_QUESTION", "PRICE_QUESTION", "COMPARISON"):
        return "MEDIUM"
    return "LOW"


def classify_signal_type(intent: str, text: str) -> str:
    lower = text.lower()
    if intent in ("PURCHASE_QUESTION", "PRICE_QUESTION") or any(phrase in lower for phrase in ("donde comprar", "dónde comprar", "cuotas", "envío", "envio", "stock")):
        return "purchase_signal"
    if intent in ("TECHNICAL_QUESTION", "WARRANTY_QUESTION", "COMPARISON") or "?" in text:
        return "actionable_question"
    return "topic_interest"


_COMMENT_TYPES = {"instagram_comment", "facebook_comment", "tiktok_comment"}

def is_actionable(text: str, intent_or_source_type: str = "", source_type: str = "") -> tuple[bool, str]:
    if source_type:
        intent = intent_or_source_type
    else:
        known_intents = {
            "TECHNICAL_QUESTION", "PURCHASE_QUESTION", "PRICE_QUESTION",
            "WARRANTY_QUESTION", "COMPARISON", "GENERAL_DISCUSSION",
        }
        if intent_or_source_type in known_intents:
            intent = intent_or_source_type
            source_type = ""
        else:
            source_type = intent_or_source_type
            intent = classify_intent(text)
    cleaned = text.strip()
    if len(cleaned) < 8:
        return False, "comentario_sin_texto_real" if source_type in _COMMENT_TYPES else "elogio_o_texto_corto_sin_pregunta"
    
    # Descartar si es solo etiquetas o menciones (ej: "@usuario @usuario2")
    words = cleaned.split()
    real_words = [w for w in words if not w.startswith("@") and len(w) > 1]
    if len(real_words) < 2:
        return False, "comentario_sin_texto_real"
    if source_type in _COMMENT_TYPES and len(real_words) < 4 and "?" not in cleaned:
        return False, "comentario_sin_texto_real"
    if not source_type and len(real_words) < 4 and "?" not in cleaned and intent == "GENERAL_DISCUSSION":
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


def normalize_item(channel: str, query: str, item: dict, account: str | None, source_id: str | None = None, language: str | None = None) -> dict:
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
        "signalType": classify_signal_type(intent, text),
        "priority": classify_priority(intent, text),
        "status": "NEW",
        "notes": notes,
        "language": language or detect_language(text),
        "monitoredSourceId": source_id or "",
    }


def normalize_author_name(author: str) -> str:
    if not author:
        return ""
    author = author.strip().lower()
    if author.startswith("@"):
        author = author[1:]
    elif author.startswith("u/"):
        author = author[2:]
    elif author.startswith("r/"):
        author = author[2:]
    return author.strip()


def load_own_usernames() -> set[str]:
    own = set()
    for handle in ["midiplus_ok", "pcmidicenter", "prestigearg", "kressmer_audio", "midiplus", "kressmer", "pcmidi", "prestige-running"]:
        own.add(handle.lower())

    path = ROOT / "agents" / "accounts.json"
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)
                for key, cfg in data.items():
                    own.add(key.lower())
                    if "label" in cfg:
                        own.add(cfg["label"].lower())
                    if "twitterUsername" in cfg and cfg["twitterUsername"]:
                        own.add(cfg["twitterUsername"].lower())
        except Exception as exc:
            log.warning("listen_own_accounts_load_failed", error=str(exc))
            
    try:
        from db_pg import connect
        with connect() as conn:
            brands = conn.execute('SELECT name FROM "Brand"').fetchall()
            for b in brands:
                own.add(b["name"].lower())
            clients = conn.execute('SELECT name, slug FROM "Client"').fetchall()
            for c in clients:
                own.add(c["name"].lower())
                own.add(c["slug"].lower())
    except Exception as exc:
        log.warning("listen_db_brands_load_failed", error=str(exc))
        
    return own


def run_listen(channel: str, query: str, limit: int, dry_run: bool, account: str | None, source_id: str | None = None, client_id: str | None = None, language: str = "es", public_discovery: bool = True, indexed_only: bool = False) -> dict:
    log.info("listen_start", channel=channel, account=account or "default", query=query[:60], limit=limit, dry_run=dry_run, language=language)
    
    # Cargar dinámicamente palabras clave y exclusiones del cliente
    keywords, exclusions = load_client_rules(source_id=source_id, client_id=client_id, query=query)
    log.info("listen_rules_loaded", keywords_count=len(keywords), exclusions_count=len(exclusions))
    own_usernames = load_own_usernames()

    browser_error = ""
    ws_url = ""
    if not indexed_only:
        try:
            ws_url = browser_cdp.get_page_ws_url(account)
        except Exception as exc:
            log.error("listen_browser_connect_fail", channel=channel, account=account or "default", error=str(exc))
            # A broken local profile must not make already-indexed public posts
            # invisible. This fallback is read-only and will still go through the
            # exact same filters below before producing an intake row.
            browser_error = f"No se pudo conectar al browser: {exc}"

    try:
        if indexed_only or not ws_url:
            items = browser_cdp.extract_public_indexed_items(channel, query, limit)
        else:
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
                if len(items) < limit:
                    log.info("listen_indexed_fallback", channel=channel, query=query[:60])
                else:
                    log.info("listen_indexed_supplement", channel=channel, query=query[:60])
                indexed = browser_cdp.extract_indexed_social_items(client, channel, query, limit)
                if indexed:
                    seen_urls = {item.get("url") for item in items}
                    items.extend(item for item in indexed if item.get("url") not in seen_urls)
    except Exception as exc:
        import traceback
        log.error("listen_cdp_error", channel=channel, account=account or "default", error=str(exc))
        browser_error = f"Error CDP: {exc}"
        items = []
        _legacy_cdp_diagnostic = {
            "command": "listen", "channel": channel, "account": account or "default",
            "query": query, "limit": limit, "dry_run": dry_run, "language": language,
            "error": f"Error CDP durante extracción ({channel}): {exc}",
            "traceback": traceback.format_exc()[-800:],
            "items_read": 0, "intake_rows": 0, "discarded_count": 0,
            "discard_reasons": {}, "discarded_sample": [], "intake_path": str(INTAKE_PATH), "sample": [],
        }

    provider_health: list[dict] = []
    if public_discovery:
        recovery = listening_connectors.recover_local_services()
        public_items, provider_health = listening_connectors.discover_public(channel, query, limit)
        seen_urls = {str(item.get("url", "")) for item in items}
        items.extend(item for item in public_items if item.get("url") not in seen_urls)

    indexed_markers = ("indexed", "searxng", "rsshub", "ytdlp")
    indexed_items = sum(1 for item in items if any(marker in str(item.get("sourceType", "")).lower() for marker in indexed_markers))
    direct_items = max(0, len(items) - indexed_items)
    discovery_mode = "indexed" if indexed_only or (indexed_items > 0 and direct_items == 0) else "hybrid" if indexed_items > 0 else "direct"

    rows: list[dict] = []
    discarded: list[dict] = []

    for item in items:
        if not item.get("url"):
            discarded.append({"reason": "sin_url", "text": (item.get("context") or "")[:60]})
            continue
        author = item.get("author", "")
        norm_author = normalize_author_name(author)
        if norm_author and norm_author in own_usernames:
            discarded.append({"reason": "autor_propio", "text": f"{author} ({norm_author})"})
            continue
        if not is_on_topic(item, query, keywords, exclusions):
            discarded.append({"reason": "fuera_de_tema", "text": (item.get("context") or item.get("title") or "")[:60]})
            continue
        lang_text = (item.get("context") or item.get("title") or item.get("videoTitle") or "")
        allowed_language, detected_language = language_allowed(lang_text, language)
        if not allowed_language:
            discarded.append({"reason": f"idioma_no_{language}", "language": detected_language, "text": lang_text[:60]})
            continue
        published = item.get("publishedTime", "")
        electronic_drum_search = bool(re.search(r"\b(bater[ií]a(?:s)?\s+electr[oó]nica(?:s)?|electronic\s+drums?|e[- ]?drums?)\b", query, re.IGNORECASE))
        max_age = None if electronic_drum_search else (18 if channel in ("x", "instagram") else 24)
        if max_age is not None and is_too_old(published, max_months=max_age):
            discarded.append({"reason": "comentario_viejo", "age": published, "text": (item.get("context") or "")[:60]})
            continue
        row = normalize_item(channel, query, item, account, source_id, detected_language)
        # Los posts/videos temáticos pueden ser oportunidades de presencia contextual
        # aun sin pregunta. Los comentarios cortos siguen necesitando una señal clara.
        source_type = row.get("sourceType", "")
        contextual_source = source_type.endswith("_post") or source_type.endswith("_search_result") or source_type in {"youtube_video", "tiktok_video", "instagram_reel"}
        contextual_text = " ".join([row["sourceText"], str(row.get("sourceTitle", "")), str(item.get("videoTitle", ""))]).strip()
        if contextual_source and len(contextual_text.split()) >= 5:
            ok, reason = True, ""
        else:
            ok, reason = is_actionable(row["sourceText"], source_type)
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

    provider_errors = [
        f"{provider.get('provider', 'provider')}: {provider.get('error', provider.get('status', 'error'))}"
        for provider in provider_health
        if provider.get("status") in {"unavailable", "degraded"}
    ]
    summary = {
        "command": "listen",
        "channel": channel,
        "account": account or "default",
        "query": query,
        "language": language,
        "limit": limit,
        "dry_run": dry_run,
        "browser_error": browser_error,
        "discovery_mode": discovery_mode,
        "direct_items": direct_items,
        "indexed_items": indexed_items,
        "providers": provider_health,
        "provider_recovery": recovery if public_discovery else None,
        "error": "; ".join(provider_errors) if not items and provider_errors else "",
        "items_read": len(items),
        "intake_rows": len(rows),
        "discarded_count": len(discarded),
        "discard_reasons": discard_summary,
        "discarded_sample": discarded[:5],
        "intake_path": str(INTAKE_PATH),
        "rows": rows,
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
    parser.add_argument("--client-id", default="")
    parser.add_argument("--language", default="es", choices=["es", "en", "pt", "any"])
    parser.add_argument("--no-public-discovery", action="store_true", help="No consultar SearXNG/RSSHub autoalojados")
    parser.add_argument("--indexed-only", action="store_true", help="Omitir el conector directo y usar solo descubrimiento público indexado")
    parser.add_argument("--health", action="store_true", help="Verificar conectores de escucha y salir")
    parser.add_argument("--output-json", action="store_true", help="Devolver TODOS los rows en JSON por stdout (modo machine-readable)")
    args = parser.parse_args()

    if args.health:
        print(json.dumps(listening_connectors.health(), ensure_ascii=False, indent=2))
        return

    summary = run_listen(
        args.channel, args.query, args.limit, args.dry_run, args.account or None,
        source_id=args.source_id or None, client_id=args.client_id or None,
        language=args.language, public_discovery=not args.no_public_discovery, indexed_only=args.indexed_only
    )
    if args.output_json:
        # El orquestador/ai-presence-radar necesita la lista completa de rows, no solo el sample.
        print(json.dumps({"rows": summary.get("rows", []), "summary": summary}, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()

