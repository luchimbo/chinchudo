import random
import re
import json
from datetime import datetime
from time import sleep

from authority_swarm.config import ROOT
from authority_swarm.sources.playwright_extractor import IG_STATE_PATH


def _random_delay(min_sec: float = 5.0, max_sec: float = 10.0) -> None:
    sleep(random.uniform(min_sec, max_sec))


def _clean_json_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _walk_json(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_json(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_json(child)


def _shortcode_from_url(url: str) -> str:
    match = re.search(r"/p/([^/?#]+)/?", url)
    return match.group(1) if match else ""


def _is_ui_noise(text: str) -> bool:
    """Filtra texto que es claramente UI de Instagram."""
    if not text:
        return True
    ui_patterns = [
        r"^\d+\s+(likes?|Me gusta|replies?|respuestas?)$",
        r"^View all\s+\d+",
        r"^Ver\s+\d+\s+respuestas?",
        r"^Messages?$",
        r"^\d+\s+(d|h|s|m|w|days?|hours?|minutes?|seconds?|weeks?)$",
        r"^(Follow|Seguir|Following|Siguiendo)$",
        r"^(Verified|Verificado)$",
        r"^\d+\s+(followers?|following|seguidores?|siguiendo)$",
    ]
    for pattern in ui_patterns:
        if re.match(pattern, text, re.I):
            return True
    repeated_ui = sum(text.lower().count(token) for token in ("view all", "ver ", "replies", "messages", "likes", "me gusta"))
    if repeated_ui >= 3:
        return True
    return False


def _has_question_intent(text: str) -> bool:
    lowered = text.lower()
    query_terms = (
        "?",
        "precio",
        "valor",
        "cuanto",
        "cuánto",
        "donde",
        "dónde",
        "como",
        "cómo",
        "cual",
        "cuál",
        "modelo",
        "marca",
        "funciona",
        "necesito",
        "sirve",
        "comprar",
        "consigo",
        "envio",
        "envío",
        "argentina",
        "caba",
        "buenos aires",
    )
    return any(term in lowered for term in query_terms)


def _detect_geo_scope(text: str) -> str:
    lowered = text.lower()
    argentina_terms = ("argentina", "caba", "buenos aires", "bs as", "cordoba", "córdoba", "rosario", "mendoza", "salta")
    return "argentina" if any(term in lowered for term in argentina_terms) else "unknown"


def _is_relevant_music_gear(text: str) -> bool:
    lowered = text.lower()
    exclude_terms = (
        "teclado mecanico",
        "teclado mecânico",
        "perifericogamer",
        "periférico gamer",
        "keyboard gamer",
        "llavero",
        "antiestres",
        "ansiedad",
        "diplomado",
        "curso",
        "mastering",
        "mezcla y mastering",
        "reserva tu sesión",
    )
    include_terms = (
        "midi",
        "controlador",
        "interface de audio",
        "interfaz de audio",
        "placa de sonido",
        "placadesonido",
        "sintetizador",
        "synth",
        "ableton",
        "logic pro",
        "fl studio",
        "homestudio",
        "home studio",
        "guitarra",
        "pedal",
        "pedales",
        "microfono",
        "micrófono",
        "audio",
        "grabacion",
        "grabación",
        "teclado controlador",
        "arturia",
        "keylab",
        "minilab",
        "microfreak",
        "minifreak",
        "analog lab",
    )
    if any(term in lowered for term in exclude_terms):
        return False
    return any(term in lowered for term in include_terms)


def _media_to_post_data(media: dict, shortcode: str) -> dict[str, str]:
    caption = media.get("caption") or {}
    user = media.get("user") or media.get("owner") or {}
    taken_at = media.get("taken_at") or media.get("taken_at_timestamp") or ""
    like_count = media.get("like_count") or media.get("like_and_view_counts_disabled") or ""

    caption_text = caption.get("text") if isinstance(caption, dict) else ""
    if caption_text:
        caption_text = _clean_json_text(str(caption_text))

    return {
        "caption": caption_text,
        "author": str(user.get("username") or user.get("full_name") or "") if isinstance(user, dict) else "",
        "date": datetime.utcfromtimestamp(int(taken_at)).isoformat() if str(taken_at).isdigit() else str(taken_at),
        "likes": str(like_count) if like_count not in (None, False, "") else "",
        "shortcode": shortcode,
    }


def _extract_post_json_data(page, post_url: str) -> dict[str, str]:
    shortcode = _shortcode_from_url(post_url)
    data = {"caption": "", "comments": "", "author": "", "date": "", "likes": ""}
    comments: list[str] = []

    scripts = page.locator('script[type="application/json"]').all()
    for script in scripts:
        try:
            content = script.inner_text(timeout=1000)
            parsed = json.loads(content)
        except Exception:
            continue

        for node in _walk_json(parsed):
            code = node.get("code") or node.get("shortcode")
            if shortcode and code == shortcode and not data["caption"]:
                data.update(_media_to_post_data(node, shortcode))

            if node.get("__typename") == "XDTCommentDict" and node.get("text"):
                text = _clean_json_text(str(node["text"]))
                if len(text) > 5 and not _is_ui_noise(text) and text not in comments:
                    comments.append(text)

    data["comments"] = " | ".join(comments[:10])
    return data


def extract_instagram_post_data(page, post_url: str) -> dict[str, str]:
    """Extrae datos del post desde JSON embebido, con fallback a texto visible."""
    data = _extract_post_json_data(page, post_url)
    if data.get("caption"):
        return data

    try:
        page_text = page.inner_text("main", timeout=5000)
        lines = [line.strip() for line in page_text.split("\n") if line.strip()]
        clean_lines = [line for line in lines if len(line) > 15 and not _is_ui_noise(line) and not line.startswith("http")]
        if clean_lines:
            caption = clean_lines[0]
            if not _is_ui_noise(caption):
                data["caption"] = caption
    except Exception:
        pass
    return data


def scrape_instagram_hashtag(tag: str, limit: int = 10) -> list[dict[str, str]]:
    """Navega un hashtag de Instagram y extrae posts con caption y comentarios."""
    if not IG_STATE_PATH.exists():
        raise RuntimeError("No hay sesion de Instagram guardada. Ejecuta 'ig-login' primero.")

    from playwright.sync_api import sync_playwright

    results: list[dict[str, str]] = []
    post_urls: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            storage_state=str(IG_STATE_PATH),
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        try:
            # 1. Navegar al hashtag
            hashtag_url = f"https://www.instagram.com/explore/tags/{tag.replace('#', '').replace(' ', '')}/"
            page.goto(hashtag_url, wait_until="networkidle", timeout=30000)
            _random_delay(3, 6)

            # 2. Extraer URLs de posts recientes
            # Instagram usa article o div con links a /p/XXXXX/
            link_selectors = [
                "article a[href^='/p/']",
                "main a[href^='/p/']",
                "a[href^='/p/']",
            ]

            for selector in link_selectors:
                try:
                    links = page.locator(selector).all()
                    for link in links[:limit * 2]:  # Extraer más para tener margen
                        href = link.get_attribute("href")
                        if href and href.startswith("/p/"):
                            full_url = f"https://www.instagram.com{href}"
                            if full_url not in post_urls:
                                post_urls.append(full_url)
                    if len(post_urls) >= limit:
                        break
                except Exception:
                    continue

            post_urls = post_urls[:limit]
            print(f"  Encontrados {len(post_urls)} posts para extraer")

            # 3. Visitar cada post y extraer contenido
            for post_url in post_urls:
                try:
                    print(f"  Navegando a post: {post_url}")
                    page.goto(post_url, wait_until="networkidle", timeout=30000)
                    _random_delay(5, 10)

                    post_data = {
                        "source": "instagram_hashtag",
                        "platform": "instagram",
                        "community": f"#{tag}",
                        "url": post_url,
                        "author": "",
                        "title": f"Post de Instagram #{tag}",
                        "original_text": "",
                        "caption": "",
                        "comments": "",
                        "likes": "",
                        "date": "",
                        "result_type": "content_page",
                        "geo_scope": "unknown",
                    }

                    extracted = extract_instagram_post_data(page, post_url)
                    post_data.update({key: value for key, value in extracted.items() if key in post_data and value})

                    # Combinar caption + comentarios para original_text
                    parts = []
                    if post_data["caption"]:
                        parts.append(f"CAPTION: {post_data['caption']}")
                    if post_data["comments"]:
                        parts.append(f"COMMENTS: {post_data['comments']}")
                    post_data["original_text"] = "\n\n".join(parts)
                    detected_geo = _detect_geo_scope(post_data["original_text"])
                    if detected_geo != "unknown":
                        post_data["geo_scope"] = detected_geo

                    # Determinar result_type
                    if post_data["comments"] and _has_question_intent(post_data["comments"]):
                        post_data["result_type"] = "conversation_or_question"
                        post_data["priority"] = "2"

                    if not post_data["original_text"] or not _is_relevant_music_gear(post_data["original_text"]):
                        continue

                    results.append(post_data)

                except Exception:
                    continue

        except Exception as e:
            print(f"Error en hashtag {tag}: {e}")
        finally:
            browser.close()

    return results
