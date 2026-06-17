import random
from pathlib import Path
from time import sleep

from authority_swarm.config import ROOT

IG_STATE_PATH = ROOT / "data" / "ig_state.json"


def login_instagram() -> None:
    """Abre un navegador visible para que el usuario inicie sesion en Instagram manualmente."""
    from playwright.sync_api import sync_playwright

    IG_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.goto("https://www.instagram.com/")
        input("Inicia sesion en Instagram en la ventana abierta y presiona ENTER cuando termines...")
        context.storage_state(path=str(IG_STATE_PATH))
        browser.close()
        print(f"Sesion guardada en {IG_STATE_PATH}")


def extract_instagram_post(url: str, max_chars: int = 2000) -> str:
    """Extrae texto de un post de Instagram usando sesion guardada con delays anti-detection."""
    if not IG_STATE_PATH.exists():
        return ""

    from playwright.sync_api import sync_playwright

    text_parts: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(IG_STATE_PATH),
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            sleep(random.uniform(5, 10))

            try:
                from authority_swarm.sources.instagram_hashtag import extract_instagram_post_data

                post_data = extract_instagram_post_data(page, url)
                if post_data.get("caption"):
                    text_parts.append(f"CAPTION: {post_data['caption']}")
                if post_data.get("comments"):
                    text_parts.append(f"COMMENTS: {post_data['comments']}")
                if text_parts:
                    return "\n\n".join(text_parts)[:max_chars]
            except Exception:
                pass

            # Intentar extraer caption
            caption_selectors = [
                "article div[data-testid='user-avatar'] ~ div span",
                "article h1 ~ div span",
                "article div[role='button'] span",
            ]
            for selector in caption_selectors:
                try:
                    elements = page.locator(selector).all()
                    for el in elements:
                        txt = el.inner_text(timeout=5000).strip()
                        if txt and len(txt) > 10:
                            text_parts.append(txt)
                    if text_parts:
                        break
                except Exception:
                    continue

            # Intentar extraer comentarios
            try:
                comment_selectors = [
                    "article ul li span",
                    "article div[role='button'] ~ ul li span",
                ]
                for selector in comment_selectors:
                    comments = page.locator(selector).all()
                    for comment in comments[:15]:
                        txt = comment.inner_text(timeout=3000).strip()
                        if txt and len(txt) > 5:
                            text_parts.append(txt)
                    if text_parts:
                        break
            except Exception:
                pass

        except Exception:
            pass
        finally:
            browser.close()

    full_text = " ".join(text_parts)
    return full_text[:max_chars] if full_text else ""
