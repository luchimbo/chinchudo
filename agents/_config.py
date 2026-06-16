import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = ROOT / "reports"
ACCOUNTS_PATH = ROOT / "agents" / "accounts.json"
ACCOUNTS_EXAMPLE_PATH = ROOT / "agents" / "accounts.example.json"
RUNTIME_PATH = ROOT / "data" / "browser-runtime.json"
DEFAULT_SESSION_DIR = ROOT / "session" / "chrome-personal"
DEFAULT_CDP_PORT = 9222
DEFAULT_DOLPHIN_API_BASE = "http://localhost:3001/v1.0"
DEFAULT_DOLPHIN_CLOUD_API_BASE = "https://dolphin-anty-api.com"
DEFAULT_NSTBROWSER_API_BASE = "http://localhost:8848/api/v2"

SEARCH_URLS = {
    "youtube": "https://www.youtube.com/results?search_query={query}",
    "facebook": "https://www.facebook.com/search/posts?q={query}",
    "instagram": "https://www.instagram.com/explore/search/keyword/?q={query}",
    "x": "https://x.com/search?q={query}%20lang%3Aes&src=typed_query&f=live",
    "reddit": "https://old.reddit.com/search/?q={query}&sort=relevance&t=year",
    "tiktok": "https://www.tiktok.com/search?q={query}",
    "linkedin": "https://www.linkedin.com/search/results/content/?keywords={query}&sortBy=date",
}

LOGIN_URLS = {
    "youtube": "https://accounts.google.com/",
    "facebook": "https://www.facebook.com/login",
    "instagram": "https://www.instagram.com/accounts/login/",
    "x": "https://x.com/i/flow/login",
    "reddit": "https://www.reddit.com/login/",
    "tiktok": "https://www.tiktok.com/login?lang=es",
    "linkedin": "https://www.linkedin.com/login",
}

LOGIN_SELECTORS = {
    "facebook": {
        "username": ["#email", "input[name='email']"],
        "password": ["#pass", "input[name='pass']"],
        "submit": ["button[name='login']", "button[type='submit']"],
    },
    "instagram": {
        "username": ["input[name='username']"],
        "password": ["input[name='password']"],
        "submit": ["button[type='submit']"],
    },
    "reddit": {
        "username": ["input[name='username']", "#loginUsername"],
        "password": ["input[name='password']", "#loginPassword"],
        "submit": ["button[type='submit']"],
    },
    "youtube": {
        "username": ["input[type='email']", "#identifierId"],
        "password": ["input[type='password']", "input[name='Passwd']"],
        "submit": ["button[type='button']", "button[type='submit']"],
    },
    "x": {
        "username": ["input[autocomplete='username']", "input[name='text']"],
        "password": ["input[name='password']", "input[type='password']"],
        "submit": ["button[role='button']", "button[type='submit']"],
    },
    # TikTok: todas las cuentas usan "Continuar con Google" (OAuth). No hay form de usuario/contraseña.
    "tiktok": {
        "googleButton": [
            "[data-e2e='channel-item-google']",
            "a[href*='accounts.google.com']",
            "button[class*='google' i]",
            "div[role='button'][aria-label*='Google' i]",
            "a[aria-label*='Google' i]",
        ],
    },
    "linkedin": {
        "username": ["input[autocomplete='username']", "input[name='session_key']", "#username"],
        "password": ["input[name='session_password']", "input[type='password']", "#password"],
        "submit": ["button[type='submit']", ".login__form_action_container button"],
    },
}


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_accounts() -> dict:
    path = ACCOUNTS_PATH if ACCOUNTS_PATH.exists() else ACCOUNTS_EXAMPLE_PATH
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def account_config(account: str | None) -> dict:
    accounts = load_accounts()
    if account:
        if account not in accounts:
            raise SystemExit(f"Cuenta no configurada: {account}. Crear agents/accounts.json desde accounts.example.json")
        config = dict(accounts[account])
        config["id"] = account
        return config
    return {
        "id": "default",
        "label": "Default",
        "chromeProfile": str(DEFAULT_SESSION_DIR.relative_to(ROOT)),
        "cdpPort": DEFAULT_CDP_PORT,
        "allowedChannels": sorted(SEARCH_URLS),
        "credentials": {},
    }


def session_dir(config: dict) -> Path:
    configured = Path(config.get("chromeProfile") or DEFAULT_SESSION_DIR)
    return configured if configured.is_absolute() else ROOT / configured


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def write_report(name: str, data: dict) -> Path:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORTS_DIR / f"{utc_stamp()}-browser-{name}.json"
    path.write_text(json.dumps({"timestamp_utc": utc_stamp(), **data}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def chrome_path() -> str:
    candidates = [
        os.environ.get("CHROME_PATH", ""),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return "chrome"


def credentials_for(config: dict) -> tuple[str, str]:
    credentials = config.get("credentials") or {}
    username_env = credentials.get("usernameEnv")
    password_env = credentials.get("passwordEnv")
    username = os.environ.get(username_env or "", "")
    password = os.environ.get(password_env or "", "")
    if not username_env or not password_env:
        raise SystemExit(f"La cuenta {config['id']} no tiene variables de credenciales configuradas")
    if not username or not password:
        raise SystemExit(f"Faltan credenciales en .env: {username_env} y/o {password_env}")
    return username, password
