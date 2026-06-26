import argparse
import csv
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
TEMPLATES_DIR = ROOT / "templates"
SITE_DIR = ROOT / "site"
ASSETS_DIR = SITE_DIR / "assets"
REPORTS_DIR = ROOT / "reports"
GENERATION_EVENTS_PATH = REPORTS_DIR / "generation_events.jsonl"

CATEGORIES_PATH = DATA_DIR / "categorias_pcmidi.json"
PRODUCTS_PATH = DATA_DIR / "productos_pcmidi.json"
SEED_TOPICS_PATH = DATA_DIR / "temas_semilla.csv"

# Config activa del cliente (se puebla desde --client-slug al arrancar)
_CLIENT_CONFIG: dict = {}


def _get_client() -> dict:
    """Devuelve la config del cliente activo, o un dict vacío si es PC MIDI (comportamiento legacy)."""
    return _CLIENT_CONFIG


def client_name() -> str:
    return _CLIENT_CONFIG.get("name") or "PC MIDI Center"


def client_store_url() -> str:
    return _CLIENT_CONFIG.get("storeUrl") or "https://www.pcmidi.com.ar"


def client_blog_url() -> str:
    return _CLIENT_CONFIG.get("blogBaseUrl") or "https://blog.pcmidicenter.com"


def client_lab_name() -> str:
    return _CLIENT_CONFIG.get("labName") or "PC MIDI Labs"


def client_logo_url() -> str:
    return _CLIENT_CONFIG.get("logoUrl") or ""


def client_slug_active() -> str:
    return _CLIENT_CONFIG.get("slug") or "pcmidi"
LANDINGS_PATH = DATA_DIR / "landings_aprobadas.jsonl"
OPPORTUNITIES_PATH = DATA_DIR / "oportunidades_research.jsonl"


def _opportunities_path() -> Path:
    """Devuelve el archivo de oportunidades del cliente activo (uno por slug)."""
    slug = client_slug_active()
    if slug and slug != "pcmidi":
        return DATA_DIR / f"oportunidades_research_{slug}.jsonl"
    return OPPORTUNITIES_PATH
CONTENT_FEEDBACK_PATH = DATA_DIR / "content_feedback.jsonl"
TEMPLATE_PATH = TEMPLATES_DIR / "landing-static-template.html"
MAX_GENERATE_PER_RUN = 50
MAX_GENERATE_PER_DAY = 50

FORBIDDEN_CLAIMS = [
    "stock garantizado",
    "disponibilidad garantizada",
    "distribuidor oficial",
    "soporte tecnico oficial",
    "soporte técnico oficial",
    "canal oficial",
    "exclusividad",
    "reparaciones",
    "alquileres",
    "clases formales",
    "grabacion, mezcla o mastering",
    "grabación, mezcla o mastering",
    "precio",
    "precios",
]

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o-mini"
CATEGORY_ALIASES = {
    "auriculares-y-monitores": "auriculares-monitores",
    "microfonos-y-streaming": "microfonos-streaming",
    "microfonos-profesionales-y-estudio": "microfonos-profesionales",
    "pads-midi": "controladores-pads",
    "teclados-midi": "controladores-midi",
    "placas-de-sonido": "interfaces-audio",
    "interfaces-de-audio": "interfaces-audio",
    "baterias-electronicas-y-modulos": "baterias-electronicas",
}
PRODUCT_ALIASES = {
    "synido-live-dock-solo": "synido-livedock-live-10",
    "synido-livedock-solo": "synido-livedock-live-10",
    "synido-live-dock-live-10": "synido-livedock-live-10",
    "synido-live-dock-pro-a20": "synido-livedock-pro-a20",
    "synido-livemix-solo": "synido-livemix-solo-gris",
    "synido-live-mix-solo": "synido-livemix-solo-gris",
    "synido-live-mix-solo-gris": "synido-livemix-solo-gris",
    "synido-live-mix-solo-violeta": "synido-livemix-solo-violeta",
}


def slugify(value: str) -> str:
    value = value.lower().strip()
    replacements = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ñ": "n", "ü": "u"}
    for src, dst in replacements.items():
        value = value.replace(src, dst)
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")[:90]


def load_categories() -> dict[str, dict]:
    slug = client_slug_active()
    if _CLIENT_CONFIG and slug != "pcmidi":
        try:
            cats, _ = _load_catalog_from_db(slug)
            return cats
        except Exception as exc:
            print(f"[build_landings] No se pudo cargar categorías de DB para {slug}: {exc}. Usando archivos locales.")
    categories = json.loads(CATEGORIES_PATH.read_text(encoding="utf-8"))
    return {item["id"]: item for item in categories}


def load_products() -> dict[str, dict]:
    slug = client_slug_active()
    if _CLIENT_CONFIG and slug != "pcmidi":
        try:
            _, prods = _load_catalog_from_db(slug)
            return prods
        except Exception as exc:
            print(f"[build_landings] No se pudo cargar productos de DB para {slug}: {exc}. Usando archivos locales.")
    if not PRODUCTS_PATH.exists():
        return {}
    products = json.loads(PRODUCTS_PATH.read_text(encoding="utf-8"))
    return {item["id"]: item for item in products}


def _load_catalog_from_db(slug: str) -> tuple[dict, dict]:
    sys.path.insert(0, str(ROOT.parent / "agents"))
    import db_pg  # type: ignore
    return db_pg.load_landing_catalog(slug)


def load_lead_magnets() -> dict[str, dict]:
    """Carga lead magnets indexados por slug."""
    magnets = {}
    path = DATA_DIR / "lead_magnets.jsonl"
    if not path.exists():
        return magnets
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            record = json.loads(line)
            slug = record.get("slug")
            if slug:
                magnets[slug] = record.get("lead_magnet", {})
        except json.JSONDecodeError:
            continue
    return magnets


def _load_landings_from_pg() -> list[dict] | None:
    """Lee landings APPROVED desde Postgres. Devuelve None si no hay DB disponible."""
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        return None
    try:
        import psycopg
        from psycopg.rows import dict_row
        url = db_url.replace("postgres://", "postgresql://", 1)
        client_id = _CLIENT_CONFIG.get("id")
        with psycopg.connect(url, row_factory=dict_row) as conn:
            if client_id:
                rows = conn.execute(
                    "SELECT slug, keyword, intent, titulo, \"htmlContent\", \"seoTitle\", \"seoDescription\", \"leadMagnetId\", \"createdAt\" "
                    "FROM \"Landing\" WHERE status = 'APPROVED' AND \"clientId\" = %s ORDER BY \"createdAt\" DESC",
                    (client_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT slug, keyword, intent, titulo, \"htmlContent\", \"seoTitle\", \"seoDescription\", \"leadMagnetId\", \"createdAt\" "
                    "FROM \"Landing\" WHERE status = 'APPROVED' ORDER BY \"createdAt\" DESC"
                ).fetchall()
        # Mapear campos Prisma → formato que espera el builder
        result = []
        for r in rows:
            result.append({
                "slug": r["slug"],
                "keyword": r["keyword"],
                "intent": r.get("intent", ""),
                "titulo": r.get("titulo", ""),
                "html_content": r.get("htmlContent", ""),
                "seo_title": r.get("seoTitle", ""),
                "seo_description": r.get("seoDescription", ""),
                "lead_magnet_id": r.get("leadMagnetId"),
                "created_at": str(r.get("createdAt", "")),
            })
        return result
    except Exception as exc:
        print(f"[build_landings] No se pudo leer desde Postgres: {exc}. Usando jsonl local.")
        return None


def load_landings() -> list[dict]:
    # Intentar leer desde Postgres primero
    pg_landings = _load_landings_from_pg()
    if pg_landings is not None:
        return pg_landings
    # Fallback al jsonl local
    landings = []
    if not LANDINGS_PATH.exists():
        return landings
    for line_no, line in enumerate(LANDINGS_PATH.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            landings.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON invalido en {LANDINGS_PATH}:{line_no}: {exc}") from exc
    return landings


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_seed_topics() -> list[dict]:
    slug = client_slug_active()
    if _CLIENT_CONFIG and slug != "pcmidi":
        try:
            sys.path.insert(0, str(ROOT.parent / "agents"))
            import db_pg  # type: ignore
            topics = db_pg.load_seed_topics(slug)
            if topics:
                return topics
        except Exception as exc:
            print(f"[build_landings] No se pudo cargar temas de DB para {slug}: {exc}. Usando CSV local.")
    if not SEED_TOPICS_PATH.exists():
        return []
    with SEED_TOPICS_PATH.open("r", encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    if not path.exists():
        return rows
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"JSON invalido en {path}:{line_no}: {exc}") from exc
    return rows


def append_landing(landing: dict) -> None:
    # Escribir al jsonl local como respaldo
    LANDINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LANDINGS_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(landing, ensure_ascii=False, separators=(",", ":")) + "\n")
    # Intentar persistir en Postgres también
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url:
        try:
            sys.path.insert(0, str(ROOT.parent / "agents"))
            from db_pg import upsert_landing  # type: ignore
            extra = {}
            if _CLIENT_CONFIG.get("id"):
                extra["clientId"] = _CLIENT_CONFIG["id"]
            upsert_landing(
                slug=landing.get("slug", ""),
                keyword=landing.get("keyword", ""),
                html_content=landing.get("html_content", landing.get("htmlContent", "")),
                titulo=landing.get("titulo", ""),
                intent=landing.get("intent", ""),
                seoTitle=landing.get("seo_title", ""),
                seoDescription=landing.get("seo_description", ""),
                status="APPROVED",
                **extra,
            )
        except Exception as exc:
            print(f"[build_landings] No se pudo persistir landing en Postgres: {exc}")


def append_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def category_ids_for(landing: dict) -> list[str]:
    ids = [landing.get("primary_category_id", "")]
    ids.extend(landing.get("secondary_category_ids", []))
    return [item for item in ids if item]


def validate_landings(landings: list[dict], categories: dict[str, dict], products: dict[str, dict]) -> list[str]:
    errors: list[str] = []
    seen: dict[str, set[str]] = {"slug": set(), "seo_title": set(), "meta_description": set(), "h1": set()}
    required = ["keyword", "intent", "seo_title", "meta_description", "h1", "hero_lede", "primary_category_id"]

    for product_id, product in products.items():
        product_text = f"{product.get('nombre', '')} {product.get('modelo', '')} {product.get('url', '')}".lower()
        if product.get("categoria_id") == "software-vstis" or "/software-" in product_text or "software" in product_text:
            errors.append(f"catalogo: producto de software no permitido en hardware: {product_id}")
        if product.get("marca", "").lower() == "arturia" and re.search(r"\b[a-z0-9-]+\s+v\b", product.get("modelo", "").lower()):
            errors.append(f"catalogo: modelo Arturia V no permitido en hardware: {product_id}")

    for index, landing in enumerate(landings, start=1):
        label = landing.get("slug") or landing.get("keyword") or f"landing #{index}"
        for field in required:
            if not landing.get(field):
                errors.append(f"{label}: falta {field}")

        landing.setdefault("slug", slugify(landing.get("keyword", "")))
        for field in seen:
            value = landing.get(field, "").strip().lower()
            if not value:
                continue
            if value in seen[field]:
                errors.append(f"{label}: {field} duplicado")
            seen[field].add(value)

        ids = category_ids_for(landing)
        if not ids:
            errors.append(f"{label}: no tiene categorias")
        for category_id in ids:
            if category_id not in categories:
                errors.append(f"{label}: categoria no permitida: {category_id}")

        for product_id in landing.get("product_ids", []):
            product = products.get(product_id)
            if not product:
                errors.append(f"{label}: producto no permitido: {product_id}")
                continue
            if product.get("categoria_id") not in categories:
                errors.append(f"{label}: producto con categoria invalida: {product_id}")
            store = client_store_url().rstrip("/")
            product_base = f"{store}/productos/"
            if not str(product.get("url", "")).startswith(product_base):
                errors.append(f"{label}: URL de producto invalida: {product_id}")

        text = json.dumps(landing, ensure_ascii=False).lower()
        for claim in FORBIDDEN_CLAIMS:
            if claim.lower() in text:
                errors.append(f"{label}: claim prohibido detectado: {claim}")

        for field in ("components", "steps", "faqs"):
            if not landing.get(field):
                errors.append(f"{label}: falta bloque {field}")

    return errors


def render_template(template: str, values: dict[str, str]) -> str:
    for key, value in values.items():
        template = template.replace("{{ " + key + " }}", value)
    return template


def write_report(name: str, data: dict) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    path = REPORTS_DIR / f"{stamp}-{name}.json"
    payload = {"timestamp_utc": stamp, **data}
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def append_generation_event(run_id: str, event: dict) -> None:
    payload = {
        "timestamp_utc": datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f"),
        "run_id": run_id,
        **event,
    }
    append_jsonl(GENERATION_EVENTS_PATH, [payload])


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_site_manifest() -> dict:
    files = []
    if SITE_DIR.exists():
        for path in sorted(item for item in SITE_DIR.rglob("*") if item.is_file()):
            files.append({
                "path": path.relative_to(SITE_DIR).as_posix(),
                "size": path.stat().st_size,
                "sha256": file_sha256(path),
            })
    return {"file_count": len(files), "files": files}


def load_vercel_project() -> dict:
    project_path = ROOT / ".vercel" / "project.json"
    if not project_path.exists():
        return {}
    try:
        return json.loads(project_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def parse_vercel_deploy_url(stdout_lines: list[str], stderr_lines: list[str]) -> str:
    for line in reversed(stdout_lines):
        if line.startswith("https://"):
            return line
        match = re.search(r'"url":\s*"(https://[^"]+)"', line)
        if match:
            return match.group(1)
    for line in reversed(stderr_lines):
        match = re.search(r"(https://[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+)", line)
        if match:
            return match.group(1)
    return ""


def deploy_with_vercel(base_url: str) -> dict:
    project = load_vercel_project()
    if not project.get("projectId"):
        report_path = write_report("deploy-blocked", {
            "command": "deploy",
            "status": "blocked",
            "target": "vercel",
            "reason": "vercel_project_not_linked",
            "action": "Ejecutar `vercel link` o restaurar `.vercel/project.json`.",
            "site_dir": str(SITE_DIR),
        })
        raise SystemExit(f"Deploy bloqueado: falta enlace de Vercel. Reporte: {report_path}")

    vercel_bin = shutil.which("vercel") or shutil.which("vercel.cmd")
    npx_bin = shutil.which("npx") or shutil.which("npx.cmd")
    if vercel_bin:
        command = [vercel_bin, "deploy", "--prod", "--yes"]
        safe_command = ["vercel", "deploy", "--prod", "--yes"]
    elif npx_bin:
        command = [npx_bin, "vercel", "deploy", "--prod", "--yes"]
        safe_command = ["npx", "vercel", "deploy", "--prod", "--yes"]
    else:
        report_path = write_report("deploy-blocked", {
            "command": "deploy",
            "status": "blocked",
            "target": "vercel",
            "reason": "vercel_cli_missing",
            "action": "Instalar Vercel CLI o Node.js/npx, o ejecutar el deploy desde un entorno que tenga `vercel` disponible.",
            "site_dir": str(SITE_DIR),
            "project": {
                "projectId": project.get("projectId"),
                "orgId": project.get("orgId"),
                "projectName": project.get("projectName"),
            },
        })
        raise SystemExit(f"Deploy bloqueado: no se encontro Vercel CLI. Reporte: {report_path}")

    token = os.environ.get("VERCEL_TOKEN", "").strip()
    scope = os.environ.get("VERCEL_SCOPE", "").strip()
    if token:
        command.extend(["--token", token])
    if scope:
        command.extend(["--scope", scope])

    if token:
        safe_command.extend(["--token", "***"])
    if scope:
        safe_command.extend(["--scope", scope])

    started_at = datetime.now(timezone.utc).isoformat()
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, timeout=1800)
    finished_at = datetime.now(timezone.utc).isoformat()
    stdout_lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    stderr_lines = [line.strip() for line in result.stderr.splitlines() if line.strip()]
    deploy_url = parse_vercel_deploy_url(stdout_lines, stderr_lines)
    manifest = collect_site_manifest()
    payload = {
        "command": "deploy",
        "status": "ok" if result.returncode == 0 else "blocked",
        "target": "vercel",
        "base_url": base_url,
        "site_dir": str(SITE_DIR),
        "project": {
            "projectId": project.get("projectId"),
            "orgId": project.get("orgId"),
            "projectName": project.get("projectName"),
        },
        "started_at_utc": started_at,
        "finished_at_utc": finished_at,
        "returncode": result.returncode,
        "command_line": safe_command,
        "deploy_url": deploy_url,
        "stdout_tail": stdout_lines[-20:],
        "stderr_tail": stderr_lines[-20:],
        "file_count": manifest["file_count"],
        "files": manifest["files"],
    }
    report_path = write_report("deploy" if result.returncode == 0 else "deploy-blocked", payload)
    if result.returncode != 0:
        raise SystemExit(f"Deploy bloqueado: Vercel devolvio codigo {result.returncode}. Reporte: {report_path}")
    payload["report"] = str(report_path)
    return payload


def today_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


def generated_today_count() -> int:
    count = 0
    for path in REPORTS_DIR.glob(f"{today_stamp()}-*-generate.json"):
        try:
            report = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        if not report.get("dry_run"):
            count += int(report.get("created_count", 0))
    return count


def enforce_generation_limits(limit: int) -> int:
    if limit < 0:
        raise SystemExit("El limite no puede ser negativo")
    used_today = generated_today_count()
    remaining_today = MAX_GENERATE_PER_DAY - used_today
    allowed = min(limit, MAX_GENERATE_PER_RUN, max(remaining_today, 0))
    if limit > MAX_GENERATE_PER_RUN:
        report_path = write_report("generate-blocked", {"command": "generate", "status": "blocked", "reason": "run_limit", "requested": limit, "max_per_run": MAX_GENERATE_PER_RUN})
        raise SystemExit(f"Generate bloqueado: limite por ejecucion excedido. Reporte: {report_path}")
    if remaining_today <= 0 and limit:
        report_path = write_report("generate-blocked", {"command": "generate", "status": "blocked", "reason": "daily_limit", "requested": limit, "used_today": used_today, "max_per_day": MAX_GENERATE_PER_DAY})
        raise SystemExit(f"Generate bloqueado: limite diario alcanzado. Reporte: {report_path}")
    return allowed


def compact_catalog(categories: dict[str, dict], products: dict[str, dict]) -> dict:
    return {
        "categorias": [
            {
                "id": item["id"],
                "nombre": item["nombre"],
                "url": item["url"],
                "descripcion": item.get("descripcion", ""),
                "keywords": item.get("keywords", []),
            }
            for item in categories.values()
        ],
        "productos": [
            {
                "id": item["id"],
                "marca": item["marca"],
                "modelo": item["modelo"],
                "nombre": item["nombre"],
                "categoria_id": item["categoria_id"],
                "uso": item.get("uso", ""),
            }
            for item in products.values()
        ],
    }


def extract_json_object(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("La IA no devolvio un objeto JSON")
    return json.loads(text[start : end + 1])


def chat_json(system: str, user: str, model: str, temperature: float = 0.35) -> dict:
    load_env()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError("Falta OPENROUTER_API_KEY en .env o variables de entorno")
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    request = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": client_store_url().rstrip("/") + "/",
            "X-Title": f"{client_name()} Landing Generator",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Error OpenRouter {exc.code}: {detail}") from exc
    content = data["choices"][0]["message"]["content"]
    return extract_json_object(content)


def generation_prompt(topic: dict, categories: dict[str, dict], products: dict[str, dict]) -> tuple[str, str]:
    catalog = compact_catalog(categories, products)
    brand = client_name()
    system = f"""Sos estratega SEO y especialista en landings comerciales para {brand}.
Devolves solo JSON valido, sin markdown ni explicaciones.
La landing debe ser unica, concreta, util para un posible comprador y relacionada con productos vendidos por {brand}.
No inventes categorias, productos, marcas, modelos ni URLs. Solo usa IDs del catalogo recibido.
No menciones precios, stock, disponibilidad, distribuidor oficial, soporte tecnico oficial, exclusividad, reparaciones, alquileres, clases formales, grabacion, mezcla ni mastering.
No incluyas software Arturia tipo Modular V, CS-80 V, CMI V, Synclavier V ni packs de plugins.
Usa español rioplatense claro y humano."""
    brand = client_name()
    user = f"""Tema semilla:
- keyword: {topic.get('keyword', '')}
- intencion: {topic.get('intencion', '')}
- categorias sugeridas: {topic.get('categorias_sugeridas', '')}

Catalogo cerrado permitido:
{json.dumps(catalog, ensure_ascii=False)}

Genera una landing JSON con exactamente esta forma:
{{
  "slug": "slug-seo-unico",
  "keyword": "busqueda objetivo concreta",
  "intent": "intencion del usuario",
  "seo_title": "title unico de maximo 65 caracteres",
  "meta_description": "meta description unica de 140 a 160 caracteres",
  "h1": "H1 unico y natural",
  "hero_lede": "subtitulo humano de 1 a 2 frases",
  "components_title": "titulo humano y especifico para la seccion de opciones",
  "components_subtitle": "parrafo que mencione productos/modelos reales si ayudan",
  "primary_category_id": "id_categoria",
  "secondary_category_ids": ["id_categoria", "id_categoria"],
  "product_ids": ["id_producto", "id_producto", "id_producto"],
  "components": [
    {{"cat":"Categoria o parte del setup", "shortCat":"ETIQUETA", "why":"para que sirve", "look":"que mirar al elegir"}},
    {{"cat":"Categoria o parte del setup", "shortCat":"ETIQUETA", "why":"para que sirve", "look":"que mirar al elegir"}},
    {{"cat":"Categoria o parte del setup", "shortCat":"ETIQUETA", "why":"para que sirve", "look":"que mirar al elegir"}}
  ],
  "steps": [
    {{"n":"01", "t":"paso concreto", "b":"explicacion breve"}},
    {{"n":"02", "t":"paso concreto", "b":"explicacion breve"}},
    {{"n":"03", "t":"paso concreto", "b":"explicacion breve"}}
  ],
  "faqs": [
    {{"q":"pregunta realista", "a":"respuesta segura"}},
    {{"q":"pregunta realista", "a":"respuesta segura"}},
    {{"q":"pregunta realista", "a":"respuesta segura"}}
  ]
}}

Reglas:
- El primary_category_id y secondary_category_ids deben existir en el catalogo.
- product_ids debe contener 2 a 5 productos reales del catalogo, todos hardware.
- Si un producto no ayuda al tema, no lo uses.
- No uses frases genericas como "lo que entra en juego".
- No afirmes que {brand} tiene stock ni disponibilidad.
- La landing debe responder una busqueda o problema real de comprador."""
    return system, user


def normalize_generated_landing(landing: dict) -> dict:
    landing["slug"] = slugify(landing.get("slug") or landing.get("keyword", ""))
    landing["primary_category_id"] = CATEGORY_ALIASES.get(landing.get("primary_category_id"), landing.get("primary_category_id"))
    landing["secondary_category_ids"] = [CATEGORY_ALIASES.get(item, item) for item in landing.get("secondary_category_ids", [])]
    landing["secondary_category_ids"] = list(dict.fromkeys(landing.get("secondary_category_ids", [])))[:5]
    landing["product_ids"] = [PRODUCT_ALIASES.get(item, item) for item in landing.get("product_ids", [])]
    landing["product_ids"] = list(dict.fromkeys(landing.get("product_ids", [])))[:5]
    return landing


def topic_key(value: str) -> str:
    return slugify(value).lower()


def topic_key_from_record(record: dict) -> str:
    return topic_key(record.get("keyword") or record.get("busqueda_objetivo") or record.get("h1") or "")


def classify_topic(keyword: str, categories: dict[str, dict], products: dict[str, dict]) -> tuple[list[str], list[str]]:
    text = keyword.lower()
    weak_terms = {"midi", "pads", "sonidos", "kit", "hardware", "software", "home studio", "streaming", "departamento", "arturia"}
    category_scores: list[tuple[int, str]] = []
    for category_id, category in categories.items():
        if category_id == "home":
            continue
        score = 0
        strong_hits = 0
        for term in category.get("keywords", []):
            term_l = term.lower()
            if term_l in text:
                if term_l in weak_terms:
                    score += 1
                else:
                    score += 3
                    strong_hits += 1
        if category["nombre"].lower() in text:
            score += 4
            strong_hits += 1
        if score and (strong_hits or score >= 5):
            category_scores.append((score, category_id))
    product_ids = []
    for product_id, product in products.items():
        terms = [product.get("modelo", ""), product.get("nombre", "")]
        if any(term and term.lower() in text for term in terms):
            product_ids.append(product_id)
            if product.get("categoria_id"):
                category_scores.append((6, product["categoria_id"]))
    category_ids = [item for _, item in sorted(category_scores, reverse=True)]
    category_ids = list(dict.fromkeys(category_ids))[:4]
    product_ids = list(dict.fromkeys(product_ids))[:5]
    return category_ids, product_ids


def opportunity_from_keyword(keyword: str, intent: str, source: str, categories: dict[str, dict], products: dict[str, dict], evidence: str = "") -> dict | None:
    category_ids, product_ids = classify_topic(keyword, categories, products)
    if not category_ids:
        return None
    return {
        "keyword": keyword.strip(),
        "intencion": intent.strip() or "resolver una busqueda de compra",
        "categorias_sugeridas": ";".join(category_ids),
        "product_ids_sugeridos": product_ids,
        "source": source,
        "evidence": evidence[:500],
    }


def _generic_category_suffixes(categories: dict[str, dict]) -> list[str]:
    """Para clientes no-pcmidi: genera sufijos desde los keywords de sus propias categorías."""
    extras: list[str] = []
    for cat in categories.values():
        for kw in (cat.get("keywords") or []):
            kw = kw.strip()
            if kw and 3 <= len(kw) <= 40 and kw.lower() not in ("", "none"):
                extras.append(f"para {kw}")
        name = (cat.get("nombre") or "").strip()
        if name and 3 <= len(name) <= 40:
            extras.append(f"de {name}")
    return list(dict.fromkeys(extras))


def generate_keyword_variations(seed: dict, categories: dict[str, dict] | None = None) -> list[tuple[str, str]]:
    keyword = seed.get("keyword", "").strip()
    intent = seed.get("intencion", "").strip()
    if not keyword:
        return []
    category_text = seed.get("categorias_sugeridas", "")
    kl = keyword.lower()

    # ── Prefijos de intención de búsqueda ─────────────────────────────────────
    prefixes = [
        "que comprar para",
        "como elegir",
        "mejor opcion de",
        "guia para elegir",
        "comparar opciones de",
        "setup con",
        "cual es el mejor",
        "recomendacion de",
        "que tipo de",
        "vale la pena comprar",
        "diferencia entre modelos de",
        "como empezar con",
        "opciones economicas de",
        "opciones profesionales de",
    ]

    # ── Sufijos universales (aplican a cualquier cliente/producto) ─────────────
    suffixes: list[str] = [
        "para principiantes",
        "para uso profesional",
        "para uso diario",
        "relacion calidad precio",
        "economico",
        "de calidad profesional",
        "para adultos",
        "para ninos",
        "para regalo",
        "portatil",
        "resistente",
    ]

    # ── Sufijos específicos de PC MIDI (solo para is_pcmidi) ─────────────────
    pcmidi_generic_suffixes: list[str] = [
        "para home studio",
        "para departamento",
        "para cuarto chico",
        "para uso en vivo",
        "para grabar en casa",
        "para setup minimalista",
        "para escritorio",
        "para musica electronica",
        "para produccion musical",
        "para grabar covers",
        "para grabar podcasts",
        "para clases online",
        "para trabajar desde casa",
        "para laptop",
    ]

    # ── Sufijos por DAW ─────────────────────────────────────────────────────
    daw_suffixes = [
        "compatible con Ableton",
        "compatible con FL Studio",
        "compatible con Logic Pro",
        "compatible con GarageBand",
        "compatible con Reaper",
        "compatible con Cubase",
        "compatible con Studio One",
        "compatible con Bitwig",
        "para Ableton Live",
        "para FL Studio",
        "para Logic Pro",
        "para GarageBand",
        "para Reaper",
    ]

    # ── Sufijos por perfil de comprador ────────────────────────────────────
    buyer_suffixes = [
        "para beatmaker",
        "para productor de trap",
        "para productor de reggaeton",
        "para productor de musica electronica",
        "para DJ",
        "para cantante",
        "para guitarrista",
        "para baterista",
        "para musico amateur",
        "para musico profesional",
        "para streamer",
        "para youtuber",
        "para podcaster",
        "para locutor",
        "para compositor",
        "para estudiante de musica",
        "para ninos",
        "para adolescentes",
        "para adultos mayores",
    ]

    # ── Sufijos por género musical ──────────────────────────────────────────
    genre_suffixes = [
        "para trap",
        "para reggaeton",
        "para cumbia digital",
        "para rock",
        "para metal",
        "para jazz",
        "para musica clasica",
        "para lo-fi",
        "para techno",
        "para house",
        "para ambient",
        "para hip hop",
        "para folk",
        "para pop",
    ]

    # ── Sufijos por categoría de producto ──────────────────────────────────
    category_suffixes: dict[str, list[str]] = {
        "microfonos-streaming": [
            "para YouTube", "para Twitch", "para podcast", "para clases online",
            "sin complicarse", "USB", "con soporte de mesa", "cardioide",
            "para voces claras", "para ambiente silencioso",
        ],
        "microfonos": [
            "para voces", "para locucion", "con interfaz de audio", "para grabar covers",
            "dinamico", "de condensador", "cardioide", "XLR", "con phantom power",
            "para cuarto sin tratamiento", "para habitacion con eco",
        ],
        "microfonos-profesionales": [
            "para voz hablada", "para cantar", "con phantom power", "para grabacion casera",
            "de condensador de gran diafragma", "para voces femeninas", "para voces masculinas",
            "para narrador", "para locutora", "para doblaje",
        ],
        "interfaces-audio": [
            "para dos entradas", "para guitarra", "para voz", "para notebook",
            "para conectar monitores", "USB-C", "USB", "con preamp limpio",
            "para dos micros", "para bajo electrico", "con phantompara condensador",
            "de dos canales", "de cuatro canales", "con auriculares integrado",
        ],
        "controladores-midi": [
            "para hacer beats", "para tocar acordes", "para producir en notebook",
            "para escritorio chico", "con pads", "con 25 teclas", "con 49 teclas",
            "con 61 teclas", "con aftertouch", "con ruedas de pitch y mod",
            "sin alimentacion externa", "bus-powered",
        ],
        "controladores-pads": [
            "para finger drumming", "para samples", "para trap", "para live set",
            "sensibles a la velocidad", "con iluminacion RGB", "para Maschine style",
            "para MPC style", "con 16 pads", "con efectos integrados",
        ],
        "auriculares": [
            "para grabar voces", "para mezclar de noche", "para tocar guitarra", "para streaming",
            "cerrados", "abiertos", "semiabiertos", "para monitoreo", "para DJing",
            "con cable desmontable", "para sesiones largas", "comodidad premium",
        ],
        "monitores-estudio": [
            "para cuarto chico", "para escritorio", "para producir", "para editar video",
            "de campo cercano", "de 5 pulgadas", "de 8 pulgadas",
            "activos", "con entrada XLR", "con DSP", "para cuarto sin tratamiento",
        ],
        "sintetizadores": [
            "para bajos", "para leads", "para pads", "para directo", "sin computadora",
            "analogico", "digital", "virtual analogico", "polifonico", "monofonico",
            "de escritorio", "compacto", "con secuenciador integrado", "con efectos onboard",
        ],
        "sintes-analogicos-hibridos": [
            "para aprender sintesis", "para texturas", "para musica electronica", "con vocoder",
            "semi-modular", "modular", "con parche", "para drone", "para basslines",
        ],
        "secuenciadores": [
            "para dawless", "para sintes hardware", "para patrones", "para directo",
            "de pasos", "para groovebox", "MIDI y CV", "de 16 pasos", "de 64 pasos",
        ],
        "baterias-electronicas": [
            "para practicar de noche", "para chicos", "para grabar MIDI", "para tocar en vivo",
            "silenciosa", "con mesh heads", "para jazz", "para rock",
            "con modulos HD", "con pedal doble", "para sesiones en vivo",
        ],
        "camaras": [
            "para YouTube", "para streaming", "para podcast de video", "para cursos online",
            "4K", "con autoenfoque", "mirrorless", "con lente luminoso",
            "para interiores", "para grabar con poco luz",
        ],
    }

    # ── Sufijos de conectividad y formato físico ────────────────────────────
    connectivity_suffixes: list[str] = []
    if any(c in category_text for c in ["controladores-midi", "interfaces-audio", "microfonos-streaming"]):
        connectivity_suffixes = ["USB", "USB-C", "sin drivers", "plug and play", "con alimentacion USB"]
    if "sintetizadores" in category_text or "secuenciadores" in category_text:
        connectivity_suffixes += ["con MIDI DIN", "con CV gate", "con salida USB MIDI"]

    # ── Armar sufijos finales ────────────────────────────────────────────────
    is_pcmidi = client_slug_active() == "pcmidi"
    all_suffixes = list(suffixes)

    if is_pcmidi:
        # Sufijos específicos de PC MIDI (música/producción)
        all_suffixes.extend(pcmidi_generic_suffixes)
        if any(c in category_text for c in ["controladores-midi", "sintetizadores", "secuenciadores", "controladores-pads"]):
            all_suffixes.extend(daw_suffixes)
        all_suffixes.extend(buyer_suffixes)
        if any(c in category_text for c in [
            "controladores-midi", "controladores-pads", "sintetizadores", "sintes-analogicos-hibridos",
            "secuenciadores", "baterias-electronicas",
        ]):
            all_suffixes.extend(genre_suffixes)
        for cat_id, extra in category_suffixes.items():
            if cat_id in category_text:
                all_suffixes.extend(extra)
        all_suffixes.extend(connectivity_suffixes)
    elif categories:
        # Cliente genérico: sufijos derivados de sus propias categorías en DB
        all_suffixes.extend(_generic_category_suffixes(categories))

    all_suffixes = list(dict.fromkeys(all_suffixes))

    # ── Construir variaciones ────────────────────────────────────────────────
    variations: list[tuple[str, str]] = [(keyword, intent)]

    for prefix in prefixes:
        variations.append((f"{prefix} {keyword}", intent))

    if is_pcmidi:
        use_cases = [
            "home studio chico", "departamento", "creadores de contenido",
            "principiantes", "setup portable", "uso profesional",
            "produccion en vivo", "grabacion en casa", "estudio casero",
            "musica en cuarto", "espacio reducido",
        ]
    else:
        use_cases = [
            "principiantes", "uso profesional", "uso diario", "adultos",
            "ninos", "adolescentes", "deporte amateur", "alta competencia",
            "entrenamiento", "partidos oficiales", "uso en exterior",
        ]
    for use_case in use_cases:
        if use_case not in kl:
            variations.append((f"{keyword} para {use_case}", intent))

    # Frases de intención universal (aplican a cualquier cliente)
    variations.extend([
        (f"cual es el mejor {keyword}", intent),
        (f"que {keyword} comprar sin gastar de mas", intent),
        (f"como elegir el {keyword} adecuado", intent),
        (f"vale la pena el {keyword}", intent),
    ])

    if is_pcmidi:
        if any(c in category_text for c in ["microfonos", "interfaces-audio", "auriculares", "monitores-estudio"]):
            variations.extend([
                (f"{keyword} para mejorar audio en casa", intent),
                (f"{keyword} para grabar contenido", intent),
                (f"{keyword} para grabacion sin ruido", intent),
                (f"como conectar {keyword} a la computadora", intent),
            ])
        if any(c in category_text for c in ["controladores-midi", "controladores-pads", "sintetizadores", "secuenciadores"]):
            variations.extend([
                (f"{keyword} para producir musica electronica", intent),
                (f"{keyword} para workflow sin complicarse", intent),
                (f"{keyword} para empezar a producir", intent),
                (f"primer {keyword} para productor", intent),
                (f"cual {keyword} tiene mejor relacion precio calidad", intent),
            ])

    for suffix in all_suffixes:
        if suffix.lower() not in kl:
            variations.append((f"{keyword} {suffix}", intent))

    return list(dict.fromkeys(variations))


def ddg_research_queries(queries: list[str], limit: int) -> list[tuple[str, str]]:
    try:
        from ddgs import DDGS
    except Exception:
        return []
    results: list[tuple[str, str]] = []
    with DDGS() as ddgs:
        for query in queries:
            if len(results) >= limit:
                break
            try:
                for item in ddgs.text(query, region="ar-es", safesearch="moderate", max_results=5):
                    title = item.get("title") or ""
                    body = item.get("body") or ""
                    candidate = title.strip(" -|PC MIDI Center")
                    if candidate and 8 <= len(candidate) <= 95:
                        results.append((candidate, body))
                    if len(results) >= limit:
                        break
            except Exception:
                continue
    return results


def research_opportunities(limit: int, use_web: bool = True) -> None:
    categories = load_categories()
    products = load_products()
    seeds = load_seed_topics()
    existing_landings = load_landings()
    opps_path = _opportunities_path()
    existing_opps = load_jsonl(opps_path)
    seen = {topic_key_from_record(item) for item in existing_landings}
    seen.update(topic_key_from_record(item) for item in existing_opps)

    opportunities: list[dict] = []
    for seed in seeds:
        if len(opportunities) >= limit:
            break
        for keyword, intent in generate_keyword_variations(seed, categories):
            key = topic_key(keyword)
            if not key or key in seen:
                continue
            opportunity = opportunity_from_keyword(keyword, intent, "seed_variation", categories, products)
            if not opportunity:
                continue
            opportunities.append(opportunity)
            seen.add(key)
            if len(opportunities) >= limit:
                break

    if use_web and len(opportunities) < limit:
        queries = [f"{seed.get('keyword', '')} opiniones compra Argentina" for seed in seeds[:20]]
        for keyword, evidence in ddg_research_queries(queries, limit - len(opportunities)):
            key = topic_key(keyword)
            if not key or key in seen:
                continue
            opportunity = opportunity_from_keyword(keyword, "busqueda detectada en web", "duckduckgo", categories, products, evidence=evidence)
            if not opportunity:
                continue
            opportunities.append(opportunity)
            seen.add(key)
            if len(opportunities) >= limit:
                break

    append_jsonl(opps_path, opportunities)
    print(f"Oportunidades nuevas: {len(opportunities)} en {opps_path}")


def discover_opportunities(limit: int = 30, use_reddit: bool = True, use_youtube: bool = True) -> None:
    """Descubre nuevas oportunidades desde content_feedback, Reddit y YouTube RSS."""
    categories = load_categories()
    products = load_products()
    existing_landings = load_landings()
    opps_path = _opportunities_path()
    existing_opps = load_jsonl(opps_path)
    seen = {topic_key_from_record(item) for item in existing_landings}
    seen.update(topic_key_from_record(item) for item in existing_opps)

    opportunities: list[dict] = []

    # Fuente 1: gaps de content_feedback.jsonl (sin HTTP, gratis)
    signals_to_discover = {"high_traffic_low_capture", "strong_conversion_pattern", "leads_low_commercial_intent"}
    for entry in load_jsonl(CONTENT_FEEDBACK_PATH):
        if len(opportunities) >= limit:
            break
        signal = entry.get("signal", "")
        entry_type = entry.get("type", "")
        if signal not in signals_to_discover and entry_type != "gap":
            continue
        slug = entry.get("slug", "")
        keyword = entry.get("keyword") or slug.replace("-", " ").strip()
        if not keyword:
            continue
        key = topic_key(keyword)
        if not key or key in seen:
            continue
        opp = opportunity_from_keyword(keyword, "gap_detectado_conversion", "content_feedback", categories, products)
        if opp:
            opportunities.append(opp)
            seen.add(key)

    # Fuente 2: Reddit — títulos de posts en subreddits de música
    if use_reddit and len(opportunities) < limit:
        try:
            import sys as _sys
            _sys.path.insert(0, str(ROOT / "src"))
            from authority_swarm.sources.reddit import search_reddit
            question_signals = ["?", "cual", "cuál", "cómo", "como", "que ", "qué ", "recomendacion", "ayuda", "help", "suggest", "recommend"]
            seeds = load_seed_topics()[:15]
            for seed in seeds:
                if len(opportunities) >= limit:
                    break
                kw = seed.get("keyword", "")
                if not kw:
                    continue
                try:
                    results = search_reddit(kw, limit=3)
                except Exception:
                    continue
                for result in results:
                    if len(opportunities) >= limit:
                        break
                    title = (result.get("title") or "").strip()
                    snippet = (result.get("snippet") or result.get("original_text") or "")[:500]
                    if not title or not any(s in title.lower() for s in question_signals):
                        continue
                    if not (8 <= len(title) <= 95):
                        continue
                    key = topic_key(title)
                    if not key or key in seen:
                        continue
                    opp = opportunity_from_keyword(title, "pregunta_detectada_reddit", "reddit", categories, products, evidence=snippet)
                    if opp:
                        opportunities.append(opp)
                        seen.add(key)
        except Exception as exc:
            print(f"discover: reddit no disponible ({exc})")

    # Fuente 3: YouTube RSS — títulos de videos como seed candidates
    if use_youtube and len(opportunities) < limit:
        try:
            import sys as _sys
            _sys.path.insert(0, str(ROOT / "src"))
            from authority_swarm.sources.youtube_rss import search_youtube_rss
            seeds = load_seed_topics()[:10]
            for seed in seeds:
                if len(opportunities) >= limit:
                    break
                kw = seed.get("keyword", "")
                if not kw:
                    continue
                try:
                    results = search_youtube_rss(kw, limit=3)
                except Exception:
                    continue
                for result in results:
                    if len(opportunities) >= limit:
                        break
                    title = (result.get("title") or "").strip()
                    snippet = (result.get("snippet") or result.get("original_text") or "")[:500]
                    if not title or not (8 <= len(title) <= 95):
                        continue
                    key = topic_key(title)
                    if not key or key in seen:
                        continue
                    opp = opportunity_from_keyword(title, "contenido_detectado_youtube", "youtube_rss", categories, products, evidence=snippet)
                    if opp:
                        opportunities.append(opp)
                        seen.add(key)
        except Exception as exc:
            print(f"discover: youtube_rss no disponible ({exc})")

    if opportunities:
        append_jsonl(opps_path, opportunities)
    print(f"discover: {len(opportunities)} nuevas oportunidades (feedback={sum(1 for o in opportunities if o.get('source')=='content_feedback')}, reddit={sum(1 for o in opportunities if o.get('source')=='reddit')}, youtube={sum(1 for o in opportunities if o.get('source')=='youtube_rss')})")


def generate_landings(limit: int, model: str, dry_run: bool = False, max_seconds: int = 0) -> dict:
    requested_limit = limit
    limit = enforce_generation_limits(limit) if not dry_run else min(limit, MAX_GENERATE_PER_RUN)
    started_at = time.monotonic()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    categories = load_categories()
    products = load_products()
    existing = load_landings()
    existing_slugs = {item.get("slug") for item in existing}
    existing_keywords = {topic_key_from_record(item) for item in existing}
    topics = load_seed_topics() + load_jsonl(_opportunities_path())
    created = 0
    created_items = []
    skipped_items = []
    blocked_items = []
    processed = 0
    stopped_reason = "limit_reached"

    for topic in topics:
        if created >= limit:
            break
        if max_seconds and time.monotonic() - started_at >= max_seconds:
            stopped_reason = "max_seconds_reached"
            break
        processed += 1
        if topic_key_from_record(topic) in existing_keywords:
            skipped = {"keyword": topic.get("keyword") or topic.get("busqueda_objetivo"), "reason": "already_exists"}
            skipped_items.append(skipped)
            append_generation_event(run_id, {"command": "generate", "event": "skipped", "dry_run": dry_run, **skipped})
            continue
        try:
            system, user = generation_prompt(topic, categories, products)
            landing = normalize_generated_landing(chat_json(system, user, model=model))
        except Exception as exc:
            blocked = {"keyword": topic.get("keyword") or topic.get("busqueda_objetivo"), "reason": "generation_error", "error": str(exc)}
            blocked_items.append(blocked)
            append_generation_event(run_id, {"command": "generate", "event": "blocked", "dry_run": dry_run, **blocked})
            continue
        if landing["slug"] in existing_slugs:
            landing["slug"] = slugify(f"{landing['slug']}-{created + 1}")
        candidate_list = existing + [landing]
        errors = validate_landings(candidate_list, categories, products)
        if errors:
            print("Saltada por validacion: " + landing.get("slug", topic.get("keyword", "sin-slug")))
            for error in errors:
                print(f"- {error}")
            blocked = {"keyword": topic.get("keyword") or landing.get("keyword"), "slug": landing.get("slug"), "reason": "validation_error", "errors": errors}
            blocked_items.append(blocked)
            append_generation_event(run_id, {"command": "generate", "event": "blocked", "dry_run": dry_run, **blocked})
            continue
        print(f"Generada: {landing['slug']} ({landing['keyword']})")
        if not dry_run:
            append_landing(landing)
        existing.append(landing)
        existing_slugs.add(landing["slug"])
        existing_keywords.add(topic_key_from_record(landing))
        created += 1
        created_item = {"slug": landing["slug"], "keyword": landing["keyword"]}
        created_items.append(created_item)
        append_generation_event(run_id, {"command": "generate", "event": "created", "dry_run": dry_run, **created_item})

    if created < limit and stopped_reason == "limit_reached":
        stopped_reason = "no_more_topics_or_all_skipped"
    print(f"Landings nuevas: {created}")
    summary = {
        "command": "generate",
        "status": "ok",
        "model": model,
        "run_id": run_id,
        "dry_run": dry_run,
        "requested_limit": requested_limit,
        "effective_limit": limit,
        "processed_count": processed,
        "created_count": created,
        "stopped_reason": stopped_reason,
        "elapsed_seconds": round(time.monotonic() - started_at, 2),
        "max_seconds": max_seconds,
        "skipped_count": len(skipped_items),
        "blocked_count": len(blocked_items),
        "created": created_items,
        "skipped": skipped_items[:200],
        "blocked": blocked_items[:200],
    }
    report_path = write_report("generate", summary)
    print(f"Reporte generado: {report_path}")
    return {**summary, "report": str(report_path)}


def render_landing(landing: dict, categories: dict[str, dict], products: dict[str, dict], base_url: str, lead_magnets: dict[str, dict] | None = None) -> str:
    primary = categories[landing["primary_category_id"]]
    category_ids = category_ids_for(landing)
    selected = [categories[item] for item in category_ids]
    selected_products = [products[item] for item in landing.get("product_ids", []) if item in products]

    # Renderizar lead magnet si existe
    lead_magnet_html = ""
    slug = landing.get("slug") or slugify(landing.get("keyword", ""))
    magnet = (lead_magnets or {}).get(slug)
    if magnet:
        magnet_title = esc(magnet.get("title", ""))
        magnet_desc = esc(magnet.get("description", ""))
        magnet_cta = esc(magnet.get("cta_text", "Descargar recurso"))
        magnet_type = esc(magnet.get("resource_type", "recurso"))
        magnet_value = esc(magnet.get("value_proposition", ""))
        
        lead_magnet_html = f'''<section id="lead-magnet" class="section lead-magnet-section">
      <div class="container lead-magnet-grid">
        <div class="lead-magnet-content">
          <span class="lead-magnet-badge">{magnet_type.upper()} GRATUITO</span>
          <h2>{magnet_title}</h2>
          <p>{magnet_desc}</p>
          {f'<p><strong>{magnet_value}</strong></p>' if magnet_value else ''}
        </div>
        <div class="lead-magnet-form">
          <h3>Recibir el {magnet_type}</h3>
          <p>Dejanos tu email y te enviamos el recurso directamente.</p>
          <form action="/api/leads" method="POST" class="lm-form">
            <input type="email" name="email" placeholder="tu@email.com" required class="lm-input" aria-label="Email">
            <input type="text" name="nombre" placeholder="Nombre (opcional)" class="lm-input" aria-label="Nombre">
            <label class="lm-privacy" style="display:flex; gap:.55rem; align-items:flex-start; margin:.2rem 0 .9rem;"><input type="checkbox" name="consentimiento" value="true" required style="margin-top:.2rem;">Acepto recibir este recurso, informacion util y novedades de {esc(client_lab_name())}.</label>
            <input type="hidden" name="slug" value="{esc(slug)}">
            <input type="hidden" name="keyword" value="{esc(landing.get('keyword', ''))}">
            <input type="hidden" name="lead_magnet" value="{magnet_title}">
            <button type="submit" class="lm-submit">{magnet_cta}</button>
            <div class="lm-status" role="status" aria-live="polite" style="margin-top:.8rem; font-size:13px;"></div>
          </form>
          <span class="lm-privacy">No enviamos spam. Podes darte de baja en cualquier momento.</span>
        </div>
      </div>
    </section>'''

    components = landing.get("components", [])
    components_html = []
    for index, component in enumerate(components, start=1):
        category = selected[min(index - 1, len(selected) - 1)]
        components_html.append(
            f'<article class="comp-card"><div class="comp-head"><span class="comp-num">{index:02d}</span>'
            f'<span class="mono-label dim">{esc(component.get("shortCat", category["nombre"]))}</span></div>'
            f'<h3 class="comp-name">{esc(component.get("cat", category["nombre"]))}</h3>'
            f'<p class="comp-text"><strong>Para que sirve:</strong> {esc(component.get("why", category["descripcion"]))}</p>'
            f'<p class="comp-text"><strong>Que mirar:</strong> {esc(component.get("look", "Comparar alternativas segun tu caso de uso."))}</p>'
            f'<a class="comp-link" href="{esc(category["url"])}" target="_blank" rel="noopener"><span>Ver categoria en {esc(client_name())}</span><span>↗</span></a></article>'
        )

    steps_html = []
    for step in landing.get("steps", []):
        steps_html.append(
            f'<li class="step-item"><div><span class="step-num-big">{esc(step.get("n", ""))}</span></div>'
            f'<div><h3 class="step-title">{esc(step.get("t", ""))}</h3><p class="step-text">{esc(step.get("b", ""))}</p></div></li>'
        )

    faqs_html = []
    faq_entities = []
    for faq in landing.get("faqs", []):
        question = str(faq.get("q", ""))
        answer = str(faq.get("a", ""))
        faqs_html.append(f'<article class="faq-item"><h3>{esc(question)}</h3><p>{esc(answer)}</p></article>')
        faq_entities.append({"@type": "Question", "name": question, "acceptedAnswer": {"@type": "Answer", "text": answer}})

    faq_json_ld = json.dumps({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_entities}, ensure_ascii=False)
    vu_bars = "".join(f'<span style="height:{height}px; --i:{index}"></span>' for index, height in enumerate([42, 70, 94, 132, 156, 120, 86, 58, 144, 168, 124, 92, 64, 112, 150, 78]))
    step_leds = "".join(f'<span style="--i:{index}"></span>' for index in range(16))
    slug = landing.get("slug") or slugify(landing["keyword"])
    canonical_url = landing_url(slug, base_url)
    components_title = landing.get("components_title") or f"Opciones para resolver: {landing['keyword']}"
    components_subtitle = landing.get("components_subtitle") or (
        f"Estas categorias ayudan a comparar {primary['nombre'].lower()} y accesorios relacionados segun el uso real: "
        f"que queres conectar, como vas a producir y que parte del setup necesitas mejorar primero."
    )
    product_links_html = ""
    if selected_products:
        product_items = []
        for product in selected_products:
            product_items.append(
                f'<a class="product-pill" href="{esc(product["url"])}" target="_blank" rel="noopener">'
                f'<span>{esc(product["marca"])} {esc(product["modelo"])}</span>'
                f'<small>{esc(product["uso"])}</small></a>'
            )
        product_links_html = '<div class="product-strip"><span class="mono-label dim">Productos mencionados</span><div class="product-strip-grid">' + "".join(product_items) + "</div></div>"

    values = {
        "seo_title": esc(landing["seo_title"]),
        "meta_description": esc(landing["meta_description"]),
        "canonical_url": esc(canonical_url),
        "faq_json_ld": esc(faq_json_ld).replace("&quot;", '"'),
        "primary_url": esc(primary["url"]),
        "primary_name": esc(primary["nombre"]),
        "cta_text": f"Ver opciones en {client_name()}",
        "code": esc(client_name()[:12].upper() + " · " + slug[:14].upper()),
        "eyebrow": esc("Guia tecnica · " + primary["nombre"]),
        "h1": esc(landing["h1"]),
        "lead_magnet_html": lead_magnet_html,
        "hero_lede": esc(landing["hero_lede"]),
        "keyword": esc(landing["keyword"]),
        "components_title": esc(components_title),
        "components_subtitle": esc(components_subtitle),
        "product_links_html": product_links_html,
        "components_html": "\n".join(components_html),
        "steps_html": "\n".join(steps_html),
        "faqs_html": "\n".join(faqs_html),
        "vu_bars": vu_bars,
        "step_leds": step_leds,
        "asset_prefix": "../",
        "index_href": "../index.html",
        "primary_color": _CLIENT_CONFIG.get("landingPrimaryColor") or "#EB6517",
        "secondary_color": _CLIENT_CONFIG.get("landingSecondaryColor") or "#F6A00C",
    }
    return render_template(TEMPLATE_PATH.read_text(encoding="utf-8"), values)


def landing_url(slug: str, base_url: str = "") -> str:
    path = f"/{quote(slug)}/"
    return f"{base_url.rstrip('/')}{path}" if base_url else path


def validate_built_site(landings: list[dict], sitemap_urls: list[str]) -> list[str]:
    errors: list[str] = []
    required_files = [SITE_DIR / "index.html", SITE_DIR / "sitemap.xml", SITE_DIR / "robots.txt"]
    for path in required_files:
        if not path.exists():
            errors.append(f"site: falta {path.relative_to(ROOT)}")

    sitemap_path = SITE_DIR / "sitemap.xml"
    robots_path = SITE_DIR / "robots.txt"
    sitemap_text = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else ""
    robots_text = robots_path.read_text(encoding="utf-8") if robots_path.exists() else ""

    if "Sitemap:" not in robots_text or "sitemap.xml" not in robots_text:
        errors.append("site: robots.txt no referencia sitemap.xml")

    for loc in sitemap_urls:
        if f"<loc>{esc(loc)}</loc>" not in sitemap_text:
            errors.append(f"site: sitemap no incluye {loc}")

    for landing in landings:
        slug = landing.get("slug") or slugify(landing["keyword"])
        output = SITE_DIR / slug / "index.html"
        if not output.exists():
            errors.append(f"site: falta landing generada {output.relative_to(ROOT)}")

    return errors


def render_index(landings: list[dict], categories: dict[str, dict], base_url: str) -> str:
    primary_color = _CLIENT_CONFIG.get("landingPrimaryColor") or "#EB6517"
    canonical_url = f"{base_url.rstrip('/')}/" if base_url else "/"
    featured = landings[:12]
    latest = landings[:48]
    category_counts = []
    for category_id, category in categories.items():
        if category_id == "home":
            continue
        count = sum(1 for landing in landings if category_id in category_ids_for(landing))
        if count:
            category_counts.append((count, category))
    category_counts.sort(key=lambda item: (-item[0], item[1]["nombre"]))

    featured_html = []
    for index, landing in enumerate(featured, start=1):
        slug = landing.get("slug") or slugify(landing["keyword"])
        featured_html.append(
            f'<article class="guide-card guide-card-{index}"><span class="card-kicker">Guia {index:02d}</span>'
            f'<h3><a href="/{esc(slug)}/">{esc(landing["h1"])}</a></h3>'
            f'<p>{esc(landing["meta_description"])}</p>'
            f'<a class="text-link" href="/{esc(slug)}/">Leer guia <span>-></span></a></article>'
        )

    category_html = []
    for count, category in category_counts[:8]:
        category_html.append(
            f'<article class="topic-card"><span>{count} guias</span><h3>{esc(category["nombre"])}</h3>'
            f'<p>{esc(category["descripcion"])}</p>'
            f'<a href="{esc(category["url"])}" target="_blank" rel="noopener">Ver categoria en {esc(brand)}</a></article>'
        )

    latest_html = []
    for landing in latest:
        slug = landing.get("slug") or slugify(landing["keyword"])
        latest_html.append(f'<li><a href="/{esc(slug)}/">{esc(landing["h1"])}</a><span>{esc(landing["keyword"])}</span></li>')

    brand = client_name()
    store_url = client_store_url()
    schema = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": f"Blog {brand}",
        "url": canonical_url,
        "description": f"Guias de compra y comparativas de productos de {brand}.",
    }

    return f'''<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blog {esc(brand)} | Guias de compra</title>
  <meta name="description" content="Guias para elegir productos de {esc(brand)} en Argentina.">
  <link rel="canonical" href="{esc(canonical_url)}">
  <meta name="robots" content="index,follow">
  <script type="application/ld+json">{esc(json.dumps(schema, ensure_ascii=False)).replace('&quot;', '"')}</script>
  <style>
    * {{ box-sizing: border-box; }}
    :root {{ --paper:#F4F1EA; --paper-2:#ECE7DB; --ink:#1D1D1B; --muted:#706B61; --orange:{esc(primary_color)}; --dark:#11110F; --line:rgba(29,29,27,.16); }}
    body {{ margin:0; font-family: Georgia, 'Times New Roman', serif; background:var(--paper); color:var(--ink); }}
    a {{ color:inherit; }}
    .container {{ width:min(1180px, calc(100% - 32px)); margin:0 auto; }}
    .nav {{ display:flex; align-items:center; justify-content:space-between; gap:24px; padding:22px 0; border-bottom:1px solid var(--line); font-family:Arial,sans-serif; }}
    .logo {{ display:flex; align-items:center; gap:14px; text-decoration:none; font-weight:900; letter-spacing:-.03em; }}
    .logo img {{ width:138px; height:auto; }}
    .nav-links {{ display:flex; gap:18px; font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }}
    .nav-links a {{ text-decoration:none; color:var(--muted); }}
    .hero {{ position:relative; overflow:hidden; padding:72px 0 54px; }}
    .hero:before {{ content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(29,29,27,.06) 1px, transparent 1px), linear-gradient(rgba(29,29,27,.06) 1px, transparent 1px); background-size:42px 42px; mask-image:linear-gradient(180deg,#000,transparent); pointer-events:none; }}
    .hero-grid {{ position:relative; display:grid; grid-template-columns:minmax(0,1.1fr) 360px; gap:42px; align-items:end; }}
    .eyebrow {{ display:inline-flex; padding:8px 11px; border:1px solid var(--line); border-radius:999px; font:800 12px/1 Arial,sans-serif; text-transform:uppercase; letter-spacing:.1em; color:var(--orange); background:rgba(255,255,255,.35); }}
    h1 {{ margin:22px 0 18px; font-size:clamp(46px, 8vw, 104px); line-height:.88; letter-spacing:-.07em; max-width:920px; }}
    .lede {{ margin:0; max-width:760px; font:400 clamp(18px,2.3vw,25px)/1.35 Arial,sans-serif; color:#38352F; }}
    .hero-actions {{ display:flex; gap:14px; flex-wrap:wrap; margin-top:30px; font-family:Arial,sans-serif; }}
    .btn {{ display:inline-flex; align-items:center; justify-content:center; min-height:48px; padding:0 20px; border:2px solid var(--ink); border-radius:999px; text-decoration:none; font-weight:900; }}
    .btn-primary {{ background:var(--orange); box-shadow:5px 5px 0 var(--ink); }}
    .btn-ghost {{ background:transparent; }}
    .meter {{ background:var(--dark); color:var(--paper); border-radius:28px; padding:24px; box-shadow:10px 10px 0 rgba(235,101,23,.28); font-family:Arial,sans-serif; }}
    .meter strong {{ display:block; font-size:58px; letter-spacing:-.08em; }}
    .meter span {{ color:#B8B0A1; text-transform:uppercase; font-size:12px; letter-spacing:.12em; }}
    .bars {{ display:grid; grid-template-columns:repeat(12,1fr); align-items:end; gap:5px; height:116px; margin-top:24px; }}
    .bars i {{ display:block; background:var(--orange); border-radius:99px 99px 0 0; min-height:18px; }}
    .section {{ padding:56px 0; }}
    .section-head {{ display:flex; justify-content:space-between; gap:24px; align-items:end; margin-bottom:24px; border-top:2px solid var(--ink); padding-top:20px; }}
    .section-head h2 {{ margin:0; font-size:clamp(30px,4vw,54px); line-height:.95; letter-spacing:-.05em; }}
    .section-head p {{ margin:0; max-width:460px; font:16px/1.5 Arial,sans-serif; color:var(--muted); }}
    .guide-grid {{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }}
    .guide-card, .topic-card {{ background:rgba(255,255,255,.38); border:1px solid var(--line); border-radius:24px; padding:22px; min-height:245px; display:flex; flex-direction:column; }}
    .guide-card-1 {{ grid-column:span 2; background:var(--ink); color:var(--paper); }}
    .guide-card h3, .topic-card h3 {{ margin:12px 0; font-size:28px; line-height:1; letter-spacing:-.04em; }}
    .guide-card p, .topic-card p {{ margin:0; font:15px/1.45 Arial,sans-serif; color:inherit; opacity:.78; }}
    .guide-card a, .topic-card a {{ text-decoration:none; }}
    .card-kicker, .topic-card span {{ font:900 12px/1 Arial,sans-serif; color:var(--orange); text-transform:uppercase; letter-spacing:.12em; }}
    .text-link {{ margin-top:auto; padding-top:22px; font:900 13px/1 Arial,sans-serif; text-transform:uppercase; letter-spacing:.08em; }}
    .topic-grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }}
    .topic-card {{ min-height:230px; }}
    .topic-card a {{ margin-top:auto; color:var(--orange); font:900 13px/1.2 Arial,sans-serif; text-transform:uppercase; }}
    .latest {{ columns:2; column-gap:34px; padding:0; margin:0; list-style:none; }}
    .latest li {{ break-inside:avoid; padding:14px 0; border-bottom:1px solid var(--line); }}
    .latest a {{ display:block; font:900 17px/1.2 Arial,sans-serif; text-decoration:none; }}
    .latest span {{ display:block; margin-top:5px; font:13px/1.35 Arial,sans-serif; color:var(--muted); }}
    .cta-band {{ margin:42px 0 0; padding:30px; background:var(--dark); color:var(--paper); border-radius:30px; display:flex; align-items:center; justify-content:space-between; gap:20px; }}
    .cta-band h2 {{ margin:0; font-size:36px; line-height:1; letter-spacing:-.05em; }}
    footer {{ padding:32px 0 46px; color:var(--muted); font:14px/1.5 Arial,sans-serif; }}
    @media (max-width: 860px) {{ .hero-grid, .guide-grid, .topic-grid {{ grid-template-columns:1fr; }} .guide-card-1 {{ grid-column:auto; }} .latest {{ columns:1; }} .nav {{ align-items:flex-start; }} .nav-links {{ display:none; }} .cta-band {{ display:block; }} .cta-band .btn {{ margin-top:18px; }} }}
  </style>
</head>
<body>
  <header class="container nav">
    <a class="logo" href="/">{f'<img src="{esc(client_logo_url())}" alt="{esc(brand)}">' if client_logo_url() else ""}<span>{esc(brand)} Blog</span></a>
    <nav class="nav-links"><a href="#guias">Guias</a><a href="#temas">Temas</a><a href="#indice">Indice</a><a href="{esc(store_url)}/" target="_blank" rel="noopener">Tienda</a></nav>
  </header>
  <main>
    <section class="hero">
      <div class="container hero-grid">
        <div><span class="eyebrow">Guias de compra {esc(brand)}</span><h1>Elegir mejor con {esc(brand)}.</h1><p class="lede">Comparativas y guias practicas para elegir los productos de {esc(brand)} segun tu uso real.</p><div class="hero-actions"><a class="btn btn-primary" href="#guias">Explorar guias</a><a class="btn btn-ghost" href="{esc(store_url)}/" target="_blank" rel="noopener">Ir a la tienda</a></div></div>
        <aside class="meter"><span>Archivo indexable</span><strong>{len(landings)}</strong><span>guias publicadas</span><div class="bars" aria-hidden="true"><i style="height:38%"></i><i style="height:62%"></i><i style="height:84%"></i><i style="height:46%"></i><i style="height:92%"></i><i style="height:58%"></i><i style="height:74%"></i><i style="height:42%"></i><i style="height:100%"></i><i style="height:68%"></i><i style="height:52%"></i><i style="height:88%"></i></div></aside>
      </div>
    </section>
    <section class="section" id="guias"><div class="container"><div class="section-head"><h2>Guias destacadas</h2><p>Entradas orientadas a problemas reales de compra: que conectar, que comparar y que categoria revisar antes de decidir.</p></div><div class="guide-grid">{''.join(featured_html)}</div></div></section>
    <section class="section" id="temas"><div class="container"><div class="section-head"><h2>Temas principales</h2><p>Cada tema enlaza con categorias reales de {esc(brand)} para pasar de la duda tecnica a opciones concretas.</p></div><div class="topic-grid">{''.join(category_html)}</div><div class="cta-band"><h2>Catalogo comercial en {esc(brand)}.</h2><a class="btn btn-primary" href="{esc(store_url)}/" target="_blank" rel="noopener">Ver tienda</a></div></div></section>
    <section class="section" id="indice"><div class="container"><div class="section-head"><h2>Ultimas guias</h2><p>Indice editorial de busquedas frecuentes sobre produccion musical, audio, streaming y home studio.</p></div><ul class="latest">{''.join(latest_html)}</ul></div></section>
  </main>
  <footer class="container">{esc(brand)} comercializa productos para sus clientes. Este blog ayuda a comparar alternativas segun uso real y enlaza a categorias disponibles en la tienda.</footer>
</body>
</html>'''


def build(base_url: str = "") -> None:
    categories = load_categories()
    products = load_products()
    landings = load_landings()
    lead_magnets = load_lead_magnets()
    errors = validate_landings(landings, categories, products)
    if errors:
        report_path = write_report("build-blocked", {"command": "build", "status": "blocked", "stage": "data_validation", "errors": errors})
        raise SystemExit("Validacion fallida:\n" + "\n".join(f"- {error}" for error in errors) + f"\nReporte: {report_path}")

    previous_manifest_path = None
    if SITE_DIR.exists():
        previous_manifest = collect_site_manifest()
        if previous_manifest["file_count"]:
            previous_manifest_path = write_report("site-previous-manifest", {"command": "build", "status": "snapshot", "site_dir": str(SITE_DIR), **previous_manifest})
        shutil.rmtree(SITE_DIR)
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    for logo in ("LogoPCMIDIBlanco.png", "LogoPCMIDINegro.png"):
        source = ROOT / logo
        if source.exists():
            shutil.copy2(source, ASSETS_DIR / logo)

    sitemap_urls = [f"{base_url.rstrip('/')}/" if base_url else "/"]
    for landing in landings:
        slug = landing.get("slug") or slugify(landing["keyword"])
        html_text = render_landing(landing, categories, products, base_url, lead_magnets)
        landing_dir = SITE_DIR / slug
        landing_dir.mkdir(parents=True, exist_ok=True)
        output = landing_dir / "index.html"
        output.write_text(html_text, encoding="utf-8")
        loc = landing_url(slug, base_url)
        sitemap_urls.append(loc)

    index_html = render_index(landings, categories, base_url)
    (SITE_DIR / "index.html").write_text(index_html, encoding="utf-8")

    today = datetime.now(timezone.utc).date().isoformat()
    sitemap_xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for loc in sitemap_urls:
        sitemap_xml += f"  <url><loc>{esc(loc)}</loc><lastmod>{today}</lastmod></url>\n"
    sitemap_xml += "</urlset>\n"
    (SITE_DIR / "sitemap.xml").write_text(sitemap_xml, encoding="utf-8")

    sitemap_ref = f"Sitemap: {base_url.rstrip('/')}/sitemap.xml" if base_url else "Sitemap: sitemap.xml"
    (SITE_DIR / "robots.txt").write_text(f"User-agent: *\nAllow: /\n{sitemap_ref}\n", encoding="utf-8")
    site_errors = validate_built_site(landings, sitemap_urls)
    if site_errors:
        report_path = write_report("build-blocked", {"command": "build", "status": "blocked", "stage": "site_validation", "errors": site_errors})
        raise SystemExit("Validacion de site fallida:\n" + "\n".join(f"- {error}" for error in site_errors) + f"\nReporte: {report_path}")
    current_manifest = collect_site_manifest()
    current_manifest_path = write_report("site-current-manifest", {"command": "build", "status": "snapshot", "site_dir": str(SITE_DIR), **current_manifest})
    report_path = write_report("build", {
        "command": "build",
        "status": "ok",
        "landings": len(landings),
        "site_dir": str(SITE_DIR),
        "sitemap_urls": len(sitemap_urls),
        "previous_manifest": str(previous_manifest_path) if previous_manifest_path else None,
        "current_manifest": str(current_manifest_path),
        "file_count": current_manifest["file_count"],
    })
    print(f"Reporte generado: {report_path}")


def validate_command() -> None:
    categories = load_categories()
    products = load_products()
    landings = load_landings()
    errors = validate_landings(landings, categories, products)
    if errors:
        report_path = write_report("validate-blocked", {"command": "validate", "status": "blocked", "errors": errors})
        raise SystemExit("Validacion fallida:\n" + "\n".join(f"- {error}" for error in errors) + f"\nReporte: {report_path}")
    report_path = write_report("validate", {"command": "validate", "status": "ok", "landings": len(landings), "categories": len(categories), "products": len(products)})
    print(f"OK: {len(landings)} landings, {len(categories)} categorias y {len(products)} productos validados.")
    print(f"Reporte generado: {report_path}")


def run_pipeline(limit: int, model: str, base_url: str = "", dry_run: bool = False, max_seconds: int = 0) -> None:
    steps = []
    try:
        validate_command()
        steps.append({"step": "validate_before", "status": "ok"})
        generate_summary = generate_landings(limit=limit, model=model, dry_run=dry_run, max_seconds=max_seconds)
        steps.append({"step": "generate", "status": "ok", "report": generate_summary.get("report"), "created": generate_summary.get("created_count")})
        validate_command()
        steps.append({"step": "validate_after", "status": "ok"})
        if dry_run:
            report_path = write_report("run", {"command": "run", "status": "ok", "dry_run": True, "steps": steps})
            print(f"Run dry-run completado. Reporte generado: {report_path}")
            return
        build(base_url=base_url)
        steps.append({"step": "build", "status": "ok"})
        report_path = write_report("run", {"command": "run", "status": "ok", "dry_run": False, "steps": steps})
        print(f"Run completado. Reporte generado: {report_path}")
    except SystemExit as exc:
        report_path = write_report("run-blocked", {"command": "run", "status": "blocked", "dry_run": dry_run, "steps": steps, "error": str(exc)})
        raise SystemExit(f"Run bloqueado. Reporte: {report_path}\n{exc}") from exc


def deploy(base_url: str = "") -> None:
    validate_command()
    build(base_url=base_url)
    target = os.environ.get("DEPLOY_TARGET", "vercel").strip().lower()
    if target != "vercel":
        report_path = write_report("deploy-blocked", {
            "command": "deploy",
            "status": "blocked",
            "target": target,
            "reason": "deploy_target_not_supported",
            "supported_targets": ["vercel"],
            "site_dir": str(SITE_DIR),
        })
        raise SystemExit(f"Deploy bloqueado: destino no soportado `{target}`. Reporte: {report_path}")
    result = deploy_with_vercel(base_url=base_url)
    if result.get("deploy_url"):
        print(f"Deploy OK: {result['deploy_url']}")
    print(f"Reporte generado: {result['report']}")


def rollback() -> None:
    previous = sorted(REPORTS_DIR.glob("*-site-previous-manifest.json"))
    if not previous:
        report_path = write_report("rollback-blocked", {"command": "rollback", "status": "blocked", "reason": "no_previous_manifest"})
        raise SystemExit(f"Rollback bloqueado: no hay manifest anterior. Reporte: {report_path}")
    report_path = write_report("rollback-pending", {
        "command": "rollback",
        "status": "pending_backup_restore",
        "reason": "Existen manifests auditables, pero no backup fisico restaurable configurado.",
        "latest_previous_manifest": str(previous[-1]),
    })
    print(f"Rollback pendiente de backup fisico. Reporte generado: {report_path}")


def selftest() -> None:
    errors = []
    if slugify("Micrófono Ñ USB") != "microfono-n-usb":
        errors.append("slugify no normaliza acentos")
    categories = {"home": {"nombre": "Home", "url": "https://www.pcmidi.com.ar/", "descripcion": ""}, "controladores-midi": {"nombre": "Controladores MIDI", "url": "https://www.pcmidi.com.ar/controladores-midi/", "descripcion": ""}}
    products = {"arturia-minilab-3": {"nombre": "Arturia MiniLab 3", "marca": "Arturia", "modelo": "MiniLab 3", "categoria_id": "controladores-midi", "url": "https://www.pcmidi.com.ar/productos/arturia-minilab-3-controlador-midi-25-teclas/"}}
    sample = {"slug": "test", "keyword": "controlador midi", "intent": "comprar", "seo_title": "Controlador MIDI test", "meta_description": "Guia segura para controlador MIDI test", "h1": "Controlador MIDI test", "hero_lede": "Texto", "primary_category_id": "controladores-midi", "product_ids": ["arturia-minilab-3"], "components": [{"cat": "MIDI"}], "steps": [{"n": "01"}], "faqs": [{"q": "Que", "a": "Respuesta"}]}
    if validate_landings([sample], categories, products):
        errors.append("validate_landings rechaza una landing valida minima")
    blocked = dict(sample)
    blocked["h1"] = "Con stock garantizado"
    if not validate_landings([blocked], categories, products):
        errors.append("validate_landings no bloquea claims prohibidos")
    if errors:
        report_path = write_report("selftest-blocked", {"command": "selftest", "status": "blocked", "errors": errors})
        raise SystemExit("Selftest fallido:\n" + "\n".join(f"- {error}" for error in errors) + f"\nReporte: {report_path}")
    report_path = write_report("selftest", {"command": "selftest", "status": "ok"})
    print(f"Selftest OK. Reporte generado: {report_path}")


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Generador estatico de landings PC MIDI Center")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--base-url", default="", help="URL del subdominio para canonical/sitemap")
    research_parser = sub.add_parser("research")
    research_parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de oportunidades nuevas")
    research_parser.add_argument("--no-web", action="store_true", help="No intenta buscar sugerencias web")
    discover_parser = sub.add_parser("discover")
    discover_parser.add_argument("--limit", type=int, default=30, help="Maximo de oportunidades a descubrir")
    discover_parser.add_argument("--no-reddit", action="store_true", help="No busca en Reddit")
    discover_parser.add_argument("--no-youtube", action="store_true", help="No busca en YouTube RSS")
    generate_parser = sub.add_parser("generate")
    generate_parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de landings nuevas")
    generate_parser.add_argument("--model", default=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL), help="Modelo OpenRouter")
    generate_parser.add_argument("--dry-run", action="store_true", help="Genera y valida sin guardar")
    generate_parser.add_argument("--max-seconds", type=int, default=0, help="Corta ordenadamente la generacion despues de N segundos")
    run_parser = sub.add_parser("run")
    run_parser.add_argument("--limit", type=int, default=50, help="Cantidad maxima de landings nuevas")
    run_parser.add_argument("--model", default=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL), help="Modelo OpenRouter")
    run_parser.add_argument("--base-url", default="", help="URL del subdominio para canonical/sitemap")
    run_parser.add_argument("--dry-run", action="store_true", help="Ejecuta sin guardar landings ni reconstruir site")
    run_parser.add_argument("--max-seconds", type=int, default=0, help="Corta ordenadamente la generacion despues de N segundos")
    deploy_parser = sub.add_parser("deploy")
    deploy_parser.add_argument("--base-url", default="", help="URL del subdominio para canonical/sitemap")
    sub.add_parser("rollback")
    sub.add_parser("selftest")
    parser.add_argument("--client-slug", default="", help="Cliente cuya API key de OpenRouter usar (default: .env)")
    args = parser.parse_args()
    if getattr(args, "client_slug", ""):
        try:
            sys.path.insert(0, str(ROOT.parent / "agents"))
            import db_pg
            db_pg.inject_openrouter_env(client_slug=args.client_slug)
            global _CLIENT_CONFIG
            _CLIENT_CONFIG = db_pg.get_client_config(args.client_slug)
            print(f"build-landings: cliente activo → {_CLIENT_CONFIG.get('name')} ({args.client_slug})")
        except Exception as exc:
            print(f"build-landings: no se pudo cargar la config del cliente ({exc}); modo PC MIDI")
    if args.command == "validate":
        validate_command()
    elif args.command == "build":
        build(base_url=args.base_url)
        print(f"Sitio generado en {SITE_DIR}")
    elif args.command == "research":
        research_opportunities(limit=args.limit, use_web=not args.no_web)
    elif args.command == "discover":
        discover_opportunities(limit=args.limit, use_reddit=not args.no_reddit, use_youtube=not args.no_youtube)
    elif args.command == "generate":
        generate_landings(limit=args.limit, model=args.model, dry_run=args.dry_run, max_seconds=args.max_seconds)
    elif args.command == "run":
        run_pipeline(limit=args.limit, model=args.model, base_url=args.base_url, dry_run=args.dry_run, max_seconds=args.max_seconds)
    elif args.command == "deploy":
        deploy(base_url=args.base_url)
    elif args.command == "rollback":
        rollback()
    elif args.command == "selftest":
        selftest()


if __name__ == "__main__":
    main()
