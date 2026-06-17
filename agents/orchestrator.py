import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _log import get_logger  # noqa: E402

log = get_logger("orchestrator")

MAX_CONCURRENT_BROWSERS = 3


def resolve_bin(name: str) -> str:
    # En Windows los ejecutables de npm son .cmd; shutil.which los encuentra
    return shutil.which(name) or shutil.which(f"{name}.cmd") or name


ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = ROOT / "reports"
SOCIAL_LISTEN = ROOT / "agents" / "social-listen.py"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def write_report(name: str, data: dict) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"{utc_stamp()}-orchestrator-{name}.json"
    path.write_text(json.dumps({"timestamp_utc": utc_stamp(), **data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _run_env() -> dict:
    """Env para subprocesos: propaga AGENT_CORRELATION_ID si ya existe, o genera uno nuevo."""
    env = os.environ.copy()
    if not env.get("AGENT_CORRELATION_ID"):
        env["AGENT_CORRELATION_ID"] = utc_stamp()
    return env


def run_step(step: str, command: list[str]) -> dict:
    started = utc_stamp()
    log.info("step_start", step=step, cmd=" ".join(command))
    print(f"agents: running {step}: {' '.join(command)}")
    try:
        result = subprocess.run(command, cwd=ROOT, timeout=1800, env=_run_env())
        returncode = result.returncode
        status = "ok" if returncode == 0 else "failed"
    except subprocess.TimeoutExpired:
        returncode = -1
        status = "timeout"
    log_fn = log.info if status == "ok" else log.error
    log_fn("step_done", step=step, status=status, returncode=returncode)
    return {
        "step": step,
        "command": command,
        "started_utc": started,
        "finished_utc": utc_stamp(),
        "returncode": returncode,
        "status": status,
    }


def require_ok(result: dict, steps: list[dict], workflow: str) -> None:
    steps.append(result)
    if result["returncode"] != 0:
        report = write_report(workflow, {"command": workflow, "status": "blocked", "steps": steps})
        raise SystemExit(f"agents: {result['step']} fallo. Reporte: {report}")


def listen_command(args: argparse.Namespace) -> list[str]:
    command = [
        sys.executable,
        str(SOCIAL_LISTEN),
        "--channel",
        args.channel,
        "--account",
        getattr(args, "account", "") or "",
        "--query",
        args.query,
        "--limit",
        str(args.limit),
    ]
    if args.dry_run:
        command.append("--dry-run")
    return command


def node_command(script: str, args: argparse.Namespace) -> list[str]:
    # Los scripts .mts se ejecutan con tsx para poder importar las libs TypeScript
    if script.endswith(".mts"):
        command = [resolve_bin("npx"), "tsx", script]
    else:
        command = [resolve_bin("node"), script]
    if getattr(args, "limit", 0):
        command.extend(["--limit", str(args.limit)])
    if getattr(args, "dry_run", False):
        command.append("--dry-run")
    return command


def apply_npm_flags(args: argparse.Namespace) -> argparse.Namespace:
    if os.environ.get("npm_config_dry_run") == "true":
        args.dry_run = True
    if os.environ.get("npm_config_limit", "").isdigit() and hasattr(args, "limit"):
        args.limit = int(os.environ["npm_config_limit"])
    if os.environ.get("npm_config_channel") not in {None, "", "true"} and hasattr(args, "channel"):
        args.channel = os.environ["npm_config_channel"]
    if os.environ.get("npm_config_query") not in {None, "", "true"} and hasattr(args, "query"):
        args.query = os.environ["npm_config_query"]
    if os.environ.get("npm_config_account") not in {None, "", "true"} and hasattr(args, "account"):
        args.account = os.environ["npm_config_account"]
    return args


def apply_positional_fallback(args: argparse.Namespace, unknown: list[str]) -> argparse.Namespace:
    if args.command not in {"listen", "daily"} or not unknown:
        return args
    cleaned = [item for item in unknown if item != "--"]
    if len(cleaned) >= 1 and not getattr(args, "account", ""):
        args.account = cleaned[0]
    if len(cleaned) >= 2 and getattr(args, "channel", "youtube") == "youtube":
        args.channel = cleaned[1]
    if len(cleaned) >= 3:
        maybe_limit = cleaned[-1]
        query_parts = cleaned[2:-1] if maybe_limit.isdigit() else cleaned[2:]
        if query_parts and getattr(args, "query", "MidiPlus controlador MIDI home studio") == "MidiPlus controlador MIDI home studio":
            args.query = " ".join(query_parts)
        if maybe_limit.isdigit():
            args.limit = int(maybe_limit)
    return args


def run_listen(args: argparse.Namespace) -> None:
    steps: list[dict] = []
    require_ok(run_step("social-listen", listen_command(args)), steps, "listen")
    if not args.dry_run:
        require_ok(run_step("import-opportunities", [resolve_bin("node"), "scripts/import-opportunities.mjs"]), steps, "listen")
    report = write_report("listen", {"command": "listen", "status": "ok", "dry_run": args.dry_run, "steps": steps})
    print(f"agents: listen OK. Reporte: {report}")


def run_single_node(args: argparse.Namespace, script: str, workflow: str) -> None:
    steps: list[dict] = []
    require_ok(run_step(workflow, node_command(script, args)), steps, workflow)
    report = write_report(workflow, {"command": workflow, "status": "ok", "dry_run": getattr(args, "dry_run", False), "steps": steps})
    print(f"agents: {workflow} OK. Reporte: {report}")


def _parse_last_run(ts: str | None) -> datetime:
    """None o inválido → epoch (máxima urgencia, nunca corrió)."""
    if not ts:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def _load_accounts() -> dict:
    """Lee agents/accounts.json. Devuelve {} si no existe."""
    path = ROOT / "agents" / "accounts.json"
    if not path.exists():
        path = ROOT / "agents" / "accounts.example.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _auto_assign_account(channel: str, all_sources: list[dict], already_assigned: dict[str, datetime]) -> str | None:
    """
    Elige automáticamente la cuenta Dolphin más adecuada para un canal dado.
    Criterios (en orden):
      1. La cuenta debe tener el canal en allowedChannels.
      2. Entre las elegibles, prioriza la que menos se usó recientemente
         (combinando lastRunAt de sus fuentes + corridas ya planificadas en esta vuelta).
    """
    accounts = _load_accounts()
    eligible = [
        acc_id for acc_id, cfg in accounts.items()
        if channel in cfg.get("allowedChannels", [])
    ]
    if not eligible:
        return None

    # Urgencia: lastRunAt más reciente conocido para cada cuenta
    # (fuentes DB + lo que ya asignamos en esta vuelta)
    last_used: dict[str, datetime] = dict(already_assigned)
    for src in all_sources:
        acc = src.get("account", "") or ""
        if acc in eligible:
            ts = _parse_last_run(src.get("lastRunAt"))
            if acc not in last_used or ts > last_used[acc]:
                last_used[acc] = ts

    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    eligible.sort(key=lambda a: last_used.get(a, epoch))
    return eligible[0]


def _select_accounts(sources: list[dict], max_slots: int) -> tuple[set[str], set[str], list[dict]]:
    """
    Para cada fuente:
      - Si tiene account manual, la usa.
      - Si no, auto-asigna la cuenta Dolphin más adecuada para el canal.
    Luego limita a max_slots cuentas distintas por corrida (las más urgentes).
    Devuelve: (cuentas_seleccionadas, cuentas_diferidas, fuentes_con_cuenta_asignada)
    """
    # Paso 1: auto-asignar cuentas faltantes
    assigned_this_run: dict[str, datetime] = {}  # account_id → último uso conocido en esta vuelta
    resolved: list[dict] = []

    for src in sources:
        account = src.get("account", "") or ""
        if not account:
            account = _auto_assign_account(src["channel"], sources, assigned_this_run) or ""
            if account:
                # Marcar como "ya planificada" para esta vuelta con timestamp ahora
                # (evita que todas las fuentes sin cuenta caigan en la misma cuenta)
                assigned_this_run[account] = datetime.now(timezone.utc)
        resolved.append({**src, "account": account})

    # Paso 2: agrupar por cuenta y aplicar límite de slots
    groups: dict[str, list[dict]] = {}
    for src in resolved:
        acc = src.get("account", "")
        if acc:
            groups.setdefault(acc, []).append(src)

    def urgency(acc: str) -> datetime:
        return min(_parse_last_run(s.get("lastRunAt")) for s in groups[acc])

    sorted_accounts = sorted(groups.keys(), key=urgency)
    selected = set(sorted_accounts[:max_slots])
    deferred = set(sorted_accounts[max_slots:])
    sources_to_run = [s for s in resolved if s.get("account") in selected]
    return selected, deferred, sources_to_run


def _account_label(account_id: str) -> str:
    """Devuelve el label legible de la cuenta, o el id si no se encuentra."""
    try:
        accounts_path = ROOT / "agents" / "accounts.json"
        accounts = json.loads(accounts_path.read_text(encoding="utf-8"))
        return accounts.get(account_id, {}).get("label", account_id)
    except Exception:
        return account_id


def list_active_sources() -> list[dict]:
    # Node/Prisma es el unico que lee SQLite; Python consume el JSON por stdout.
    result = subprocess.run(
        [resolve_bin("node"), "scripts/list-monitored-sources.mjs"],
        cwd=ROOT, capture_output=True, text=True, timeout=60,
    )
    if result.returncode != 0:
        raise SystemExit(f"agents: no se pudieron listar fuentes monitoreadas. {result.stderr.strip()}")
    out = result.stdout.strip()
    line = out.splitlines()[-1] if out else "[]"
    return json.loads(line)


def run_monitor(args: argparse.Namespace) -> None:
    steps: list[dict] = []
    sources = list_active_sources()
    if not sources:
        print("agents: no hay fuentes monitoreadas activas. Cargá alguna en /monitoring.")
        return

    selected, deferred, sources_to_run = _select_accounts(sources, MAX_CONCURRENT_BROWSERS)

    total_accounts = len(selected) + len(deferred)
    print(f"\nagents: {len(sources)} fuentes | {len(sources_to_run)} a correr esta vuelta | {len(selected)}/{total_accounts} cuentas activas")
    if selected:
        labels = [f"  ->{_account_label(a)} ({a})" for a in sorted(selected)]
        print("  Perfiles que se van a usar:\n" + "\n".join(labels))
    if deferred:
        labels = [f"  ->{_account_label(a)} ({a})" for a in sorted(deferred)]
        print("  Diferidos para la próxima vuelta:\n" + "\n".join(labels))
    # Mostrar asignación fuente → cuenta para que sea auditable
    for src in sources_to_run:
        manual = bool(next((s for s in sources if s["id"] == src["id"] and s.get("account")), None))
        tag = "" if manual else " [auto]"
        print(f"  {src['label']!r:40} -> {src.get('account', '?')}{tag}")
    print()

    for src in sources_to_run:
        account = src.get("account", "") or ""
        command = [
            sys.executable, str(SOCIAL_LISTEN),
            "--channel", src["channel"],
            "--query", src["query"],
            "--account", account,
            "--limit", str(src.get("limit", 5)),
            "--source-id", src["id"],
        ]
        if args.dry_run:
            command.append("--dry-run")
        require_ok(run_step(f"listen:{src['label']}", command), steps, "monitor")

    if not args.dry_run:
        require_ok(run_step("import-opportunities", ["node", "scripts/import-opportunities.mjs"]), steps, "monitor")
    report = write_report("monitor", {
        "command": "monitor", "status": "ok", "dry_run": args.dry_run,
        "sources_total": len(sources), "sources_run": len(sources_to_run),
        "accounts_selected": sorted(selected), "accounts_deferred": sorted(deferred),
        "steps": steps,
    })
    print(f"agents: monitor OK ({len(sources_to_run)}/{len(sources)} fuentes). Reporte: {report}")


def run_daily(args: argparse.Namespace) -> None:
    steps: list[dict] = []
    require_ok(run_step("social-listen", listen_command(args)), steps, "daily")
    if not args.dry_run:
        require_ok(run_step("import-opportunities", ["node", "scripts/import-opportunities.mjs"]), steps, "daily")
    require_ok(run_step("draft-worker", node_command("scripts/draft-worker.mts", args)), steps, "daily")
    # Pasar --dry-run explícito al export para no depender solo de variables npm.
    export_command = [resolve_bin("node"), "scripts/export-csv.mjs"]
    if args.dry_run:
        export_command.append("--dry-run")
    require_ok(run_step("export-csv", export_command), steps, "daily")
    report = write_report("daily", {"command": "daily", "status": "ok", "dry_run": args.dry_run, "steps": steps})
    print(f"agents: daily OK. Reporte: {report}")


def run_healthcheck() -> None:
    """Verifica que node, Prisma y el CDP estén disponibles antes de una corrida real."""
    import urllib.request
    ok = True

    # 1. Node
    node = resolve_bin("node")
    try:
        result = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10)
        print(f"  [OK] node: {result.stdout.strip()}")
    except Exception as exc:
        print(f"  [FAIL] node no encontrado: {exc}")
        ok = False

    # 2. Prisma / base de datos
    try:
        sources = list_active_sources()
        print(f"  [OK] Prisma/DB: {len(sources)} fuentes monitoreadas activas")
    except SystemExit as exc:
        print(f"  [FAIL] Prisma/DB: {exc}")
        ok = False

    # 3. CDP — verificar todos los perfiles NSTBrowser configurados
    accounts = {}
    try:
        accounts_path = ROOT / "agents" / "accounts.json"
        accounts = json.loads(accounts_path.read_text(encoding="utf-8"))
    except Exception:
        pass

    if accounts:
        print("  CDP por perfil NSTBrowser:")
        for acc_id, cfg in accounts.items():
            port = cfg.get("cdpPort", 9222)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=2) as r:
                    data = json.loads(r.read())
                print(f"    [OK] {cfg.get('label', acc_id):35} puerto {port} — {data.get('Browser', 'activo')}")
            except Exception:
                print(f"    [--] {cfg.get('label', acc_id):35} puerto {port} — no está corriendo (abrilo en NSTBrowser)")
    else:
        try:
            with urllib.request.urlopen("http://127.0.0.1:9222/json/version", timeout=4) as r:
                data = json.loads(r.read())
            print(f"  [OK] CDP: {data.get('Browser', 'Chrome disponible')}")
        except Exception:
            print("  [WARN] CDP: Chrome no está corriendo en localhost:9222")

    # 4. Reports dir escribible
    try:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        test_file = REPORTS_DIR / f".healthcheck-{utc_stamp()}"
        test_file.write_text("ok")
        test_file.unlink()
        print("  [OK] reports/ escribible")
    except Exception as exc:
        print(f"  [FAIL] reports/ no escribible: {exc}")
        ok = False

    if ok:
        print("\nagents: healthcheck OK. El pipeline está listo.")
    else:
        raise SystemExit("\nagents: healthcheck FAIL. Corregí los errores antes de correr.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Orquestador local de agentes para Los 5 Apostoles")
    sub = parser.add_subparsers(dest="command", required=True)

    listen = sub.add_parser("listen")
    listen.add_argument("--account", default="")
    listen.add_argument("--channel", default="youtube")
    listen.add_argument("--query", default="MidiPlus controlador MIDI home studio")
    listen.add_argument("--limit", type=int, default=5)
    listen.add_argument("--dry-run", action="store_true")

    draft = sub.add_parser("draft")
    draft.add_argument("--limit", type=int, default=5)
    draft.add_argument("--dry-run", action="store_true")

    export = sub.add_parser("export")
    export.add_argument("--dry-run", action="store_true")

    daily = sub.add_parser("daily")
    daily.add_argument("--account", default="")
    daily.add_argument("--channel", default="youtube")
    daily.add_argument("--query", default="MidiPlus controlador MIDI home studio")
    daily.add_argument("--limit", type=int, default=5)
    daily.add_argument("--dry-run", action="store_true")

    monitor = sub.add_parser("monitor")
    monitor.add_argument("--dry-run", action="store_true")

    sub.add_parser("healthcheck")

    # ── Ciclo de landings SEO (ex-AgentesGuille / swarm.py) ──────────────────
    research = sub.add_parser("research", help="Investigar oportunidades de keywords para landings")
    research.add_argument("--limit", type=int, default=50)
    research.add_argument("--dry-run", action="store_true")

    generate = sub.add_parser("generate", help="Generar landings desde oportunidades aprobadas")
    generate.add_argument("--limit", type=int, default=10)
    generate.add_argument("--dry-run", action="store_true")

    build_l = sub.add_parser("build-landings", help="Build HTML estático de landings aprobadas")
    build_l.add_argument("--base-url", default="https://blog.pcmidicenter.com")

    nurture_cmd = sub.add_parser("nurture", help="Procesar emails de nurturing pendientes")
    nurture_cmd.add_argument("--limit", type=int, default=50)
    nurture_cmd.add_argument("--dry-run", action="store_true")

    dist_cmd = sub.add_parser("distribution", help="Generar / programar piezas de distribución social")
    dist_cmd.add_argument("action", choices=["generate", "approve", "schedule", "queue"], nargs="?", default="generate")
    dist_cmd.add_argument("--limit", type=int, default=10)
    dist_cmd.add_argument("--dry-run", action="store_true")

    geo_cmd = sub.add_parser("geo-audit", help="Auditar presencia GEO de PC MIDI en IAs")
    geo_cmd.add_argument("--limit", type=int, default=10)
    geo_cmd.add_argument("--dry-run", action="store_true")

    conv_cmd = sub.add_parser("conversion", help="Analizar conversión de landings")
    conv_cmd.add_argument("--window-days", type=int, default=30)
    conv_cmd.add_argument("--min-views", type=int, default=50)

    parsed, unknown = parser.parse_known_args()
    args = apply_positional_fallback(apply_npm_flags(parsed), unknown)

    SWARM = ROOT / "landing-build" / "swarm.py"
    NURTURE_SCRIPT = ROOT / "agents" / "agente_4_nurture.py"
    GEO_SCRIPT = ROOT / "agents" / "agente_geo_audit.py"
    DIST_SCRIPT = ROOT / "agents" / "agente_distribucion.py"
    CONV_SCRIPT = ROOT / "agents" / "agente_conversion.py"

    if args.command == "listen":
        run_listen(args)
    elif args.command == "draft":
        run_single_node(args, "scripts/draft-worker.mts", "draft")
    elif args.command == "export":
        run_single_node(args, "scripts/export-csv.mjs", "export")
    elif args.command == "daily":
        run_daily(args)
    elif args.command == "monitor":
        run_monitor(args)
    elif args.command == "healthcheck":
        run_healthcheck()
    elif args.command == "research":
        cmd = [sys.executable, str(SWARM), "research", "--limit", str(args.limit)]
        if args.dry_run:
            cmd.append("--dry-run")
        run_step("research", cmd)
    elif args.command == "generate":
        cmd = [sys.executable, str(SWARM), "generate", "--limit", str(args.limit)]
        if args.dry_run:
            cmd.append("--dry-run")
        run_step("generate-landings", cmd)
    elif args.command == "build-landings":
        cmd = [sys.executable, str(SWARM), "build", "--base-url", args.base_url]
        run_step("build-landings", cmd)
    elif args.command == "nurture":
        cmd = [sys.executable, str(NURTURE_SCRIPT), "--limit", str(args.limit)]
        if args.dry_run:
            cmd.append("--dry-run")
        run_step("nurture", cmd)
    elif args.command == "distribution":
        cmd = [sys.executable, str(DIST_SCRIPT), args.action, "--limit", str(args.limit)]
        if args.dry_run:
            cmd.append("--dry-run")
        run_step(f"distribution-{args.action}", cmd)
    elif args.command == "geo-audit":
        cmd = [sys.executable, str(GEO_SCRIPT), "--limit", str(args.limit)]
        if args.dry_run:
            cmd.append("--dry-run")
        run_step("geo-audit", cmd)
    elif args.command == "conversion":
        cmd = [sys.executable, str(CONV_SCRIPT), "--window-days", str(args.window_days), "--min-views", str(args.min_views)]
        run_step("conversion", cmd)


if __name__ == "__main__":
    main()
