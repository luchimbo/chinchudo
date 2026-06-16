import json
import os
import subprocess
import time
import urllib.request
from urllib.parse import quote

from _cdp import CDPClient
from _config import (
    DEFAULT_CDP_PORT,
    DEFAULT_DOLPHIN_API_BASE,
    DEFAULT_DOLPHIN_CLOUD_API_BASE,
    DEFAULT_NSTBROWSER_API_BASE,
    ROOT,
    account_config,
    chrome_path,
    load_env,
    session_dir,
)
from _log import get_logger
from _runtime import runtime_for, save_runtime_for

_log = get_logger("browser-cdp")


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def json_get(url: str) -> dict | list[dict]:
    with urllib.request.urlopen(url, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))


def json_request(url: str, method: str = "GET", data: dict | None = None) -> dict | list[dict]:
    body = None if data is None else json.dumps(data).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    token = os.environ.get("DOLPHIN_API_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def nstbrowser_request(url: str, method: str = "GET", data: dict | None = None) -> dict | list[dict]:
    body = None if data is None else json.dumps(data).encode("utf-8")
    api_key = os.environ.get("NSTBROWSER_API_KEY", "").strip()
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    request = urllib.request.Request(url, data=body, method=method, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


# ── Browser provider helpers ──────────────────────────────────────────────────

def dolphin_api_base(config: dict) -> str:
    return (
        config.get("dolphinApiBase")
        or os.environ.get("DOLPHIN_API_BASE")
        or DEFAULT_DOLPHIN_API_BASE
    ).rstrip("/")


def nstbrowser_api_base(config: dict) -> str:
    return (
        config.get("nstbrowserApiBase")
        or os.environ.get("NSTBROWSER_API_BASE")
        or DEFAULT_NSTBROWSER_API_BASE
    ).rstrip("/")


def dolphin_auth_headers() -> dict:
    token = os.environ.get("DOLPHIN_API_TOKEN", "").strip()
    return {"Authorization": f"Bearer {token}"} if token else {}


def authenticate_dolphin_local_api(base: str) -> dict:
    token = os.environ.get("DOLPHIN_API_TOKEN", "").strip()
    if not token:
        raise SystemExit("Falta DOLPHIN_API_TOKEN en .env")

    attempts = [
        ("POST", {"token": token}),
        ("POST", {"access_token": token}),
        ("GET", None),
    ]
    errors = []
    for method, payload in attempts:
        try:
            if method == "GET":
                return json_request(f"{base}/auth/login-with-token?token={quote(token)}", method="GET")
            return json_request(f"{base}/auth/login-with-token", method="POST", data=payload)
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError(f"No se pudo autenticar Dolphin Local API: {errors}")


def start_dolphin_profile(config: dict) -> dict:
    profile_id = str(config.get("dolphinProfileId") or "").strip()
    if not profile_id or profile_id == "REEMPLAZAR_PROFILE_ID":
        raise SystemExit(f"Falta dolphinProfileId real para la cuenta {config['id']} en agents/accounts.json")

    base = dolphin_api_base(config)
    authenticate_dolphin_local_api(base)
    endpoint = f"{base}/browser_profiles/{quote(profile_id)}/start?automation=1"

    def _recover_from_running(reason: str) -> dict:
        port = int(config.get("cdpPort", DEFAULT_CDP_PORT))
        try:
            version = json_get(f"http://127.0.0.1:{port}/json/version")
        except Exception as cdp_err:
            raise RuntimeError(
                f"Dolphin devolvió error para el perfil '{profile_id}' (cuenta: {config['id']}) "
                f"y el puerto CDP {port} tampoco responde.\n"
                f"  Error Dolphin API: {reason}\n"
                f"  Error CDP: {cdp_err}\n"
                f"  → Verificá que el perfil Dolphin '{config.get('label', config['id'])}' "
                f"exista y que Dolphin Anty esté corriendo correctamente."
            ) from cdp_err
        assert isinstance(version, dict)
        ws_endpoint = version.get("webSocketDebuggerUrl", "")
        save_runtime_for(config["id"], {
            "provider": "dolphin", "profile_id": profile_id,
            "port": port, "wsEndpoint": ws_endpoint,
            "api_base": base, "recovered_reason": reason,
        })
        return {
            "account": config["id"], "label": config.get("label", config["id"]),
            "browser_provider": "dolphin", "dolphin_profile_id": profile_id,
            "dolphin_api_base": base,
            "automation": {"port": port, "wsEndpoint": ws_endpoint},
            "cdp_url": f"http://127.0.0.1:{port}",
            "recovered_reason": reason,
        }

    try:
        response = json_request(endpoint, method="GET")
    except Exception as first_error:
        err_str = str(first_error).lower()
        if "500" in err_str or "already running" in err_str:
            try:
                return _recover_from_running(str(first_error)[:120])
            except Exception:
                pass
        try:
            response = json_request(endpoint, method="POST", data={})
        except Exception as second_error:
            err_str2 = str(second_error).lower()
            if "500" in err_str2 or "already running" in err_str2 or "500" in str(first_error).lower():
                return _recover_from_running(str(second_error)[:120])
            raise second_error

    automation = response.get("automation") if isinstance(response, dict) else None
    if not isinstance(automation, dict):
        automation = response.get("data", {}).get("automation") if isinstance(response, dict) else None
    if not isinstance(automation, dict) or not automation.get("port"):
        port = int(config.get("cdpPort", DEFAULT_CDP_PORT))
        try:
            version = json_get(f"http://127.0.0.1:{port}/json/version")
            assert isinstance(version, dict)
            ws_endpoint = version.get("webSocketDebuggerUrl", "")
            save_runtime_for(config["id"], {
                "provider": "dolphin", "profile_id": profile_id,
                "port": port, "wsEndpoint": ws_endpoint,
                "api_base": base, "recovered_from_configured_port": True,
                "start_response": response,
            })
            return {
                "account": config["id"], "label": config.get("label", config["id"]),
                "browser_provider": "dolphin", "dolphin_profile_id": profile_id,
                "dolphin_api_base": base,
                "automation": {"port": port, "wsEndpoint": ws_endpoint},
                "cdp_url": f"http://127.0.0.1:{port}",
                "recovered_from_configured_port": True,
            }
        except Exception as exc:
            raise RuntimeError(f"Dolphin no devolvio automation.port para {config['id']}: {response}") from exc

    save_runtime_for(config["id"], {
        "provider": "dolphin", "profile_id": profile_id,
        "port": automation.get("port"),
        "wsEndpoint": automation.get("wsEndpoint", ""),
        "api_base": base,
    })
    return {
        "account": config["id"], "label": config.get("label", config["id"]),
        "browser_provider": "dolphin", "dolphin_profile_id": profile_id,
        "dolphin_api_base": base,
        "automation": automation,
        "cdp_url": f"http://127.0.0.1:{int(automation['port'])}",
    }


def list_dolphin_profiles() -> dict:
    load_env()
    base = os.environ.get("DOLPHIN_API_BASE", DEFAULT_DOLPHIN_API_BASE).rstrip("/")
    auth = authenticate_dolphin_local_api(base)
    try:
        response = json_request(f"{base}/browser_profiles", method="GET")
        return {"api_base": base, "source": "local", "auth": auth, "response": response}
    except Exception as local_error:
        cloud_base = os.environ.get("DOLPHIN_CLOUD_API_BASE", DEFAULT_DOLPHIN_CLOUD_API_BASE).rstrip("/")
        response = json_request(f"{cloud_base}/browser_profiles", method="GET")
        return {
            "api_base": base, "cloud_api_base": cloud_base,
            "source": "cloud", "local_error": str(local_error),
            "response": response,
        }


def start_nstbrowser_profile(config: dict) -> dict:
    profile_id = str(config.get("nstbrowserProfileId") or "").strip()
    if not profile_id or profile_id == "REEMPLAZAR_PROFILE_ID":
        raise SystemExit(f"Falta nstbrowserProfileId real para la cuenta {config['id']} en agents/accounts.json")

    base = nstbrowser_api_base(config)
    api_key = os.environ.get("NSTBROWSER_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Falta NSTBROWSER_API_KEY en .env")

    try:
        response = nstbrowser_request(f"{base}/browsers/{profile_id}", method="POST", data={})
    except Exception as err:
        raise RuntimeError(
            f"\nNo se pudo iniciar el perfil Nstbrowser '{profile_id}' (cuenta: {config['id']}).\n"
            f"  Error: {err}\n\n"
            f"  Asegurate de que la app Nstbrowser esté abierta.\n"
        ) from err

    if not isinstance(response, dict) or response.get("err"):
        raise RuntimeError(f"Nstbrowser API error para {config['id']}: {response}")

    data = response.get("data", {})
    port = data.get("port")
    ws_endpoint = data.get("webSocketDebuggerUrl", "")

    if not port:
        raise RuntimeError(f"Nstbrowser no devolvió port para {config['id']}: {response}")

    save_runtime_for(config["id"], {
        "provider": "nstbrowser", "profile_id": profile_id,
        "port": port, "wsEndpoint": ws_endpoint, "api_base": base,
    })
    return {
        "account": config["id"], "label": config.get("label", config["id"]),
        "browser_provider": "nstbrowser", "nstbrowser_profile_id": profile_id,
        "nstbrowser_api_base": base,
        "automation": {"port": port, "wsEndpoint": ws_endpoint},
        "cdp_url": f"http://127.0.0.1:{int(port)}",
    }


def list_nstbrowser_profiles() -> dict:
    load_env()
    base = os.environ.get("NSTBROWSER_API_BASE", DEFAULT_NSTBROWSER_API_BASE).rstrip("/")
    api_key = os.environ.get("NSTBROWSER_API_KEY", "").strip()
    if not api_key:
        return {"error": "Falta NSTBROWSER_API_KEY en .env"}
    try:
        response = nstbrowser_request(f"{base}/profiles", method="GET")
        return {"api_base": base, "response": response}
    except Exception as err:
        return {"api_base": base, "error": str(err)}


# ── Generic browser start / ensure ───────────────────────────────────────────

def cdp_url(config: dict) -> str:
    runtime = runtime_for(config["id"])
    port = runtime.get("port") or config.get("cdpPort", DEFAULT_CDP_PORT)
    return f"http://127.0.0.1:{int(port)}"


def start_browser(account: str | None = None) -> dict:
    config = account_config(account)
    if config.get("browserProvider") == "dolphin":
        return start_dolphin_profile(config)
    if config.get("browserProvider") == "nstbrowser":
        return start_nstbrowser_profile(config)

    profile_dir = session_dir(config)
    profile_dir.mkdir(parents=True, exist_ok=True)
    port = int(config.get("cdpPort", DEFAULT_CDP_PORT))
    command = [
        chrome_path(),
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    subprocess.Popen(command, cwd=ROOT)
    return {
        "account": config["id"], "label": config.get("label", config["id"]),
        "command": command, "cdp_url": cdp_url(config),
        "session_dir": str(profile_dir),
    }


def ensure_browser(account: str | None = None) -> None:
    config = account_config(account)
    url = cdp_url(config)
    provider = config.get("browserProvider", "chrome")
    is_dolphin = provider == "dolphin"
    is_nstbrowser = provider == "nstbrowser"
    is_managed = is_dolphin or is_nstbrowser

    try:
        json_get(f"{url}/json/version")
        return
    except Exception as exc:
        _log.debug("cdp no disponible, intentando arrancar", account=account or "default", url=url, error=str(exc))

    if is_managed:
        provider_label = "Dolphin Anty" if is_dolphin else "Nstbrowser"
        try:
            start_browser(account)
        except Exception as start_err:
            label = config.get("label", account or "default")
            port = config.get("cdpPort", DEFAULT_CDP_PORT)
            raise RuntimeError(
                f"\nNo se pudo iniciar el perfil {provider_label} '{label}'.\n"
                f"  Error: {start_err}\n\n"
                f"  Asegurate de que {provider_label} esté abierto y la API key en .env sea válida.\n"
                f"  Puerto configurado: {port}"
            ) from start_err

        deadline = time.time() + 15
        while time.time() < deadline:
            try:
                json_get(f"{url}/json/version")
                return
            except Exception as exc:
                _log.debug("esperando cdp", account=account or "default", error=str(exc))
                time.sleep(0.5)
        raise RuntimeError(f"{provider_label} no expuso CDP en {url} tras iniciar el perfil")

    fallback_ports = [9222, 9223, 9224, 9225, 9226, 9227, 9228]
    for fallback_port in fallback_ports:
        fallback_url = f"http://127.0.0.1:{fallback_port}"
        try:
            json_get(f"{fallback_url}/json/version")
            _log.warning("cdp_fallback puerto", configured=config.get("cdpPort"), fallback=fallback_port, account=account or "default")
            save_runtime_for(config["id"], {
                "provider": config.get("browserProvider", "chrome"),
                "port": fallback_port, "wsEndpoint": "", "fallback": True,
            })
            return
        except Exception:
            continue

    try:
        start_browser(account)
    except Exception as start_err:
        label = config.get("label", account or "default")
        port = config.get("cdpPort", DEFAULT_CDP_PORT)
        raise RuntimeError(
            f"\nNo se pudo iniciar el perfil '{label}'.\n"
            f"  Error: {start_err}\n\n"
            f"  Tenes que tener al menos un browser abierto con CDP activo.\n"
            f"  Puerto configurado: {port}"
        ) from start_err

    deadline = time.time() + 15
    while time.time() < deadline:
        try:
            json_get(f"{url}/json/version")
            return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Chrome no expuso CDP en {url} tras iniciar el perfil")


# ── Tab management ────────────────────────────────────────────────────────────

def get_page_ws_url(account: str | None = None) -> str:
    ensure_browser(account)
    config = account_config(account)
    runtime = runtime_for(config["id"])
    if runtime.get("wsEndpoint") and "/devtools/page/" in runtime["wsEndpoint"]:
        return runtime["wsEndpoint"]

    port = runtime.get("port") or config.get("cdpPort", DEFAULT_CDP_PORT)
    url = f"http://127.0.0.1:{int(port)}"
    tabs = json_get(f"{url}/json")
    assert isinstance(tabs, list)
    for tab in tabs:
        if tab.get("type") == "page" and tab.get("webSocketDebuggerUrl"):
            return tab["webSocketDebuggerUrl"]
    tab = json_get(f"{url}/json/new")
    assert isinstance(tab, dict)
    return tab["webSocketDebuggerUrl"]


def open_new_tab(account: str | None = None, timeout: float = 30.0) -> tuple[CDPClient, str]:
    ensure_browser(account)
    config = account_config(account)
    port = runtime_for(config["id"]).get("port") or config.get("cdpPort", DEFAULT_CDP_PORT)
    base_url = f"http://127.0.0.1:{int(port)}"

    tabs = json_get(f"{base_url}/json")
    assert isinstance(tabs, list)
    ctrl_ws = next(
        (t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page" and t.get("webSocketDebuggerUrl")),
        None,
    )
    if not ctrl_ws:
        raise RuntimeError("No hay ningún tab abierto para crear uno nuevo via Target.createTarget")

    with CDPClient(ctrl_ws, timeout=10.0) as ctrl:
        ctrl.send("Target.activateTarget", {"targetId": tabs[0].get("id", "")})
        result = ctrl.send("Target.createTarget", {"url": "about:blank"})
        target_id = result.get("targetId", "")

    if not target_id:
        raise RuntimeError("Target.createTarget no devolvió targetId")

    ws_url = ""
    deadline = time.time() + 8
    while time.time() < deadline:
        fresh_tabs = json_get(f"{base_url}/json")
        assert isinstance(fresh_tabs, list)
        match = next((t for t in fresh_tabs if t.get("id") == target_id and t.get("webSocketDebuggerUrl")), None)
        if match:
            ws_url = match["webSocketDebuggerUrl"]
            break
        time.sleep(0.3)

    if not ws_url:
        raise RuntimeError(f"El nuevo tab {target_id} no expuso webSocketDebuggerUrl a tiempo")

    client = CDPClient(ws_url, timeout=timeout)
    client.connect()
    return client, target_id


def close_tab(account: str | None, tab_id: str) -> None:
    """Cierra un tab por target ID. Registra errores sin propagar."""
    try:
        config = account_config(account)
        port = runtime_for(config["id"]).get("port") or config.get("cdpPort", DEFAULT_CDP_PORT)
        try:
            json_get(f"http://127.0.0.1:{int(port)}/json/close/{tab_id}")
            return
        except Exception as exc:
            _log.debug("close_tab http fallback a CDP", tab_id=tab_id, error=str(exc))
        tabs = json_get(f"http://127.0.0.1:{int(port)}/json")
        assert isinstance(tabs, list)
        ctrl_ws = next(
            (t["webSocketDebuggerUrl"] for t in tabs if t.get("type") == "page" and t.get("webSocketDebuggerUrl") and t.get("id") != tab_id),
            None,
        )
        if ctrl_ws:
            with CDPClient(ctrl_ws, timeout=8.0) as ctrl:
                ctrl.send("Target.closeTarget", {"targetId": tab_id})
    except Exception as exc:
        _log.warning("close_tab error (no crítico)", tab_id=tab_id, error=str(exc))
