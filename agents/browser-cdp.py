"""
Fachada de browser-cdp: importa de todos los módulos para mantener
compatibilidad con social-listen.py y publisher.py que cargan este
archivo via importlib.util.spec_from_file_location.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Re-exportar todo desde los módulos internos
from _log import get_logger  # noqa: E402, F401
from _config import (  # noqa: E402, F401
    ROOT, REPORTS_DIR, ACCOUNTS_PATH, RUNTIME_PATH,
    DEFAULT_CDP_PORT, DEFAULT_DOLPHIN_API_BASE, DEFAULT_NSTBROWSER_API_BASE,
    SEARCH_URLS, LOGIN_URLS, LOGIN_SELECTORS,
    load_env, load_accounts, account_config, session_dir,
    utc_stamp, write_report, chrome_path, credentials_for,
)
from _runtime import (  # noqa: E402, F401
    load_runtime, save_runtime, runtime_for, save_runtime_for,
)
from _cdp import (  # noqa: E402, F401
    CDPClient, js_string, evaluate,
    action_fill_first, action_click_first, page_flags,
)
from _browser import (  # noqa: E402, F401
    json_get, json_request, nstbrowser_request,
    dolphin_api_base, nstbrowser_api_base,
    dolphin_auth_headers, authenticate_dolphin_local_api,
    start_dolphin_profile, list_dolphin_profiles,
    start_nstbrowser_profile, list_nstbrowser_profiles,
    cdp_url, start_browser, ensure_browser,
    get_page_ws_url, open_new_tab, close_tab,
)
from _login import (  # noqa: E402, F401
    LOGIN_CHECKS, login_account, login_status,
)
from extractors.generic import (  # noqa: E402, F401
    search_url_for, extract_visible_items,
)
from extractors.youtube import extract_youtube_comment_items  # noqa: E402, F401
from extractors.reddit import extract_reddit_comment_items  # noqa: E402, F401
from extractors.facebook import extract_facebook_post_items  # noqa: E402, F401
from extractors.instagram import extract_instagram_post_items  # noqa: E402, F401
from extractors.x import extract_x_post_items  # noqa: E402, F401
from extractors.tiktok import extract_tiktok_items  # noqa: E402, F401
from extractors.linkedin import extract_linkedin_items  # noqa: E402, F401

_log = get_logger("browser-cdp")


def main() -> None:
    load_env()
    parser = argparse.ArgumentParser(description="Chrome real via CDP para escucha controlada")
    sub = parser.add_subparsers(dest="command", required=True)
    browser_parser = sub.add_parser("start-browser")
    browser_parser.add_argument("--account", default="")
    sub.add_parser("list-dolphin-profiles")
    sub.add_parser("list-nstbrowser-profiles")
    sub.add_parser("start-all")
    ls_parser = sub.add_parser("login-status")
    ls_parser.add_argument("--account", default="")
    ls_parser.add_argument("--json", action="store_true")
    login_parser = sub.add_parser("login")
    login_parser.add_argument("--account", required=True)
    login_parser.add_argument("--channel", required=True, choices=sorted(LOGIN_URLS))
    login_parser.add_argument("--dry-run", action="store_true")
    extract_parser = sub.add_parser("extract")
    extract_parser.add_argument("--account", default="")
    extract_parser.add_argument("--channel", required=True, choices=sorted(SEARCH_URLS))
    extract_parser.add_argument("--query", required=True)
    extract_parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()

    if args.command == "start-browser":
        result = start_browser(args.account or None)
        report = write_report("start-browser", {"command": "start-browser", **result})
        print(f"Chrome iniciado. Cuenta: {result['account']}. CDP: {result['cdp_url']}. Reporte: {report}")
        return

    if args.command == "list-dolphin-profiles":
        result = list_dolphin_profiles()
        report = write_report("list-dolphin-profiles", {"command": "list-dolphin-profiles", **result})
        print(json.dumps({"report": str(report), **result}, ensure_ascii=True, indent=2))
        return

    if args.command == "list-nstbrowser-profiles":
        result = list_nstbrowser_profiles()
        report = write_report("list-nstbrowser-profiles", {"command": "list-nstbrowser-profiles", **result})
        print(json.dumps({"report": str(report), **result}, ensure_ascii=True, indent=2))
        return

    if args.command == "start-all":
        accounts = load_accounts()
        results = []
        for account_id in accounts:
            try:
                result = start_browser(account_id)
                results.append({"account": account_id, "ok": True, "cdp_url": result.get("cdp_url")})
                print(f"[OK] {account_id} -> {result.get('cdp_url')}")
            except Exception as err:
                results.append({"account": account_id, "ok": False, "error": str(err)})
                print(f"[ERROR] {account_id} -> {err}")
        report = write_report("start-all", {"command": "start-all", "results": results})
        print(f"\nReporte: {report}")
        return

    if args.command == "login-status":
        login_status(args.account or None, as_json=args.json)
        return

    if args.command == "login":
        result = login_account(args.account, args.channel, args.dry_run)
        report = write_report("login", {"command": "login", **result})
        print(json.dumps({"report": str(report), **result}, ensure_ascii=True, indent=2))
        return

    with CDPClient(get_page_ws_url(args.account or None)) as client:
        client.send("Page.enable")
        client.send("Runtime.enable")
        url = search_url_for(args.channel, args.query)
        client.send("Page.navigate", {"url": url})
        import time
        time.sleep(5)
        items = extract_visible_items(client, args.channel, args.limit)
    report = write_report("extract", {"command": "extract", "account": args.account or "default", "channel": args.channel, "query": args.query, "items": items})
    print(json.dumps({"items": len(items), "report": str(report), "sample": items[:3]}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
