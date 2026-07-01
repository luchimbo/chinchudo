"""
warmup.py — Simula navegación humana en un perfil NSTBrowser para calentar el perfil
antes de crear cuentas en Google u otras plataformas.

Uso:
    python agents/warmup.py --account deportista-aficionado
    python agents/warmup.py --account entrenador-deportivo
    python agents/warmup.py --account deportista-aficionado --account entrenador-deportivo
"""

import argparse
import random
import sys
import time
import urllib.request
import json
import os

sys.path.insert(0, os.path.dirname(__file__))

from _browser import start_browser
from _cdp import CDPClient, evaluate
from _config import load_env
from _log import get_logger

_log = get_logger("warmup")

URLS_DEPORTIVAS = [
    "https://www.google.com/search?q=medias+deportivas+futbol",
    "https://www.google.com/search?q=mejores+medias+para+correr",
    "https://www.google.com/search?q=medias+compression+running",
    "https://www.google.com/search?q=futbol+amateur+argentina",
    "https://www.google.com/search?q=zapatillas+running+2024",
    "https://www.google.com/search?q=como+entrenar+para+5k",
    "https://www.google.com/search?q=equipamiento+futbol+sala",
    "https://www.google.com/search?q=rutina+entrenamiento+funcional",
    "https://www.infobae.com/deportes/",
    "https://www.ole.com.ar/",
    "https://www.google.com/search?q=lesiones+deportivas+prevencion",
    "https://www.google.com/search?q=nutricion+deportiva+para+aficionados",
    "https://www.youtube.com/results?search_query=entrenamiento+futbol+amateurs",
    "https://www.youtube.com/results?search_query=running+consejos+principiantes",
    "https://www.google.com/search?q=gym+cerca+de+mi",
]


def get_cdp_ws(account: str) -> str:
    info = start_browser(account)
    cdp_url = info["cdp_url"]
    with urllib.request.urlopen(f"{cdp_url}/json/version", timeout=10) as r:
        version = json.loads(r.read())
    return version["webSocketDebuggerUrl"]


def open_new_tab(client: CDPClient) -> str:
    result = client.send("Target.createTarget", {"url": "about:blank"})
    return result["targetId"]


def get_tab_ws(cdp_url: str, target_id: str) -> str:
    with urllib.request.urlopen(f"{cdp_url}/json", timeout=10) as r:
        tabs = json.loads(r.read())
    for tab in tabs:
        if tab.get("id") == target_id:
            return tab["webSocketDebuggerUrl"]
    raise RuntimeError(f"No se encontró tab {target_id}")


def human_scroll(client: CDPClient):
    scrolls = random.randint(4, 10)
    for _ in range(scrolls):
        dist = random.randint(200, 600)
        evaluate(client, f"window.scrollBy({{top: {dist}, behavior: 'smooth'}})")
        time.sleep(random.uniform(0.8, 2.5))
    # A veces scrollea para arriba un poco
    if random.random() > 0.5:
        evaluate(client, f"window.scrollBy({{top: -{random.randint(100,300)}, behavior: 'smooth'}})")
        time.sleep(random.uniform(0.5, 1.5))


def navigate_and_scroll(browser_ws: str, cdp_url: str, url: str, dwell: float):
    # Crear tab via CDP WebSocket del browser (evita 405 de /json/new en Chrome moderno)
    with CDPClient(browser_ws, timeout=15) as browser:
        result = browser.send("Target.createTarget", {"url": "about:blank"})
        target_id = result["targetId"]

    # Obtener WS del tab recién creado
    with urllib.request.urlopen(f"{cdp_url}/json", timeout=10) as r:
        tabs = json.loads(r.read())
    tab_ws = next((t["webSocketDebuggerUrl"] for t in tabs if t.get("id") == target_id), None)
    if not tab_ws:
        raise RuntimeError(f"Tab {target_id} no encontrado en /json")

    with CDPClient(tab_ws, timeout=30) as client:
        client.send("Page.enable")
        client.send("Page.navigate", {"url": url})
        time.sleep(random.uniform(2.5, 4.0))
        human_scroll(client)
        time.sleep(max(0, dwell - 4.0))

    # Cerrar tab via browser WS
    with CDPClient(browser_ws, timeout=10) as browser:
        browser.send("Target.closeTarget", {"targetId": target_id})

    _log.info("visitada", url=url[:60], dwell_s=round(dwell, 1))


def warmup_account(account: str, rounds: int):
    _log.info("iniciando warmup", account=account, rounds=rounds)

    info = start_browser(account)
    cdp_url = info["cdp_url"]

    # Obtener WS del browser (no de un tab)
    with urllib.request.urlopen(f"{cdp_url}/json/version", timeout=10) as r:
        version = json.loads(r.read())
    browser_ws = version["webSocketDebuggerUrl"]

    urls = URLS_DEPORTIVAS.copy()
    random.shuffle(urls)
    selected = urls[:rounds]

    for i, url in enumerate(selected, 1):
        dwell = random.uniform(15, 45)
        _log.info(f"[{i}/{rounds}] navegando", url=url[:60])
        try:
            navigate_and_scroll(browser_ws, cdp_url, url, dwell)
            _log.info("visitada", url=url[:60], dwell_s=round(dwell, 1))
        except Exception as exc:
            _log.warning("error en tab", url=url[:60], error=str(exc))
        pause = random.uniform(3, 8)
        _log.info("pausa entre páginas", segundos=round(pause, 1))
        time.sleep(pause)

    _log.info("warmup completo", account=account)


def main():
    load_env()
    parser = argparse.ArgumentParser(description="Warm-up de perfil NSTBrowser")
    parser.add_argument("--account", action="append", required=True,
                        help="Key del account (puede repetirse para múltiples)")
    parser.add_argument("--rounds", type=int, default=8,
                        help="Cantidad de páginas a visitar por perfil (default: 8)")
    args = parser.parse_args()

    for account in args.account:
        warmup_account(account, args.rounds)


if __name__ == "__main__":
    main()
