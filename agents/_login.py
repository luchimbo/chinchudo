import json
import time
from datetime import datetime, timezone

from _browser import close_tab, open_new_tab
from _cdp import CDPClient, action_click_first, action_fill_first, evaluate, page_flags
from _config import LOGIN_SELECTORS, LOGIN_URLS, ROOT, credentials_for, load_accounts
from _log import get_logger

_log = get_logger("browser-cdp")

# Detección de sesión por red: URL a visitar + JS que devuelve {loggedIn: bool}.
LOGIN_CHECKS = {
    "youtube": (
        "https://www.youtube.com",
        '(() => ({loggedIn: !document.querySelector(\'a[href*="ServiceLogin"], a[aria-label*="Sign in" i], a[aria-label*="Acceder" i]\')}))()',
    ),
    "instagram": (
        "https://www.instagram.com",
        '(() => ({loggedIn: !(document.querySelector(\'input[name="username"]\') || location.href.includes("/accounts/login"))}))()',
    ),
    "facebook": (
        "https://www.facebook.com",
        '(() => ({loggedIn: !(document.querySelector(\'input[name="email"]\') && document.querySelector(\'input[name="pass"]\'))}))()',
    ),
    "x": (
        "https://x.com/home",
        '(() => ({loggedIn: !!document.querySelector(\'[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]\')}))()',
    ),
    "reddit": (
        "https://old.reddit.com",
        '(() => { const u = document.querySelector(".user a"); return {loggedIn: !!u && !/login|register|conect/i.test(u.textContent || "")}; })()',
    ),
}


def login_account(account: str, channel: str, dry_run: bool = False) -> dict:
    from _config import account_config, load_env
    from _browser import get_page_ws_url
    load_env()
    config = account_config(account)
    if channel not in config.get("allowedChannels", []):
        raise SystemExit(f"La cuenta {account} no permite canal {channel}")
    url = LOGIN_URLS[channel]
    selectors = LOGIN_SELECTORS[channel]

    with CDPClient(get_page_ws_url(account)) as client:
        client.send("Page.enable")
        client.send("Runtime.enable")
        client.send("Page.navigate", {"url": url})
        time.sleep(5)
        if dry_run:
            return {"account": account, "channel": channel, "dry_run": True, "url": url, "flags": page_flags(client)}

        if "googleButton" in selectors:
            click_result = action_click_first(client, selectors["googleButton"])
            time.sleep(10)
            flags = page_flags(client)
            return {
                "account": account, "channel": channel, "dry_run": False, "url": url,
                "google_button_click": click_result, "flags": flags,
                "manual_required": bool(flags.get("likelyCheckpoint")),
            }

        username, password = credentials_for(config)
        username_result = action_fill_first(client, selectors["username"], username)
        time.sleep(1.5)
        submit_username = action_click_first(client, selectors["submit"])
        time.sleep(5)
        password_result = action_fill_first(client, selectors["password"], password)
        time.sleep(1.5)
        submit_password = action_click_first(client, selectors["submit"])
        time.sleep(6)
        flags = page_flags(client)
        return {
            "account": account, "channel": channel, "dry_run": False, "url": url,
            "username_result": username_result, "submit_username": submit_username,
            "password_result": password_result, "submit_password": submit_password,
            "flags": flags, "manual_required": bool(flags.get("likelyCheckpoint")),
        }


def login_status(account_filter: str | None = None, as_json: bool = False) -> dict:
    accounts = load_accounts()
    results: dict = {}
    for acc_id, cfg in accounts.items():
        if account_filter and acc_id != account_filter:
            continue
        allowed = list(LOGIN_CHECKS)
        row: dict = {}
        try:
            client, tab = open_new_tab(acc_id, timeout=30.0)
        except Exception as err:
            results[acc_id] = {"label": cfg.get("label", acc_id), "channels": {c: "error" for c in allowed}, "error": str(err)}
            continue
        try:
            for ch in allowed:
                url, js = LOGIN_CHECKS[ch]
                try:
                    client.send("Page.navigate", {"url": url})
                    time.sleep(5)
                    r = evaluate(client, js)
                    row[ch] = "ok" if (r and r.get("loggedIn")) else "no"
                except Exception:
                    row[ch] = "error"
        finally:
            try:
                client.__exit__(None, None, None)
            except Exception:
                pass
            try:
                close_tab(acc_id, tab)
            except Exception:
                pass
        results[acc_id] = {"label": cfg.get("label", acc_id), "channels": row}

    out = {"checked_at_utc": datetime.now(timezone.utc).isoformat(), "accounts": results}
    out_path = ROOT / "data" / "login-status.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if as_json:
        print(json.dumps(out, ensure_ascii=True))
    else:
        cols = ["youtube", "instagram", "facebook", "x", "reddit"]
        sym = {"ok": "OK", "no": "--", "error": "ER"}
        header = "CUENTA".ljust(24) + "".join(c[:9].ljust(11) for c in cols)
        print(header)
        print("-" * len(header))
        for acc_id, info in results.items():
            label = info.get("label", acc_id).encode("ascii", "replace").decode("ascii")
            line = (label[:23]).ljust(24)
            for c in cols:
                v = info["channels"].get(c)
                line += (sym.get(v, " . ")).ljust(11)
            print(line)
        print(f"\nGuardado en {out_path}")
    return out
