import json
import time

from _cdp import CDPClient, evaluate
from extractors.generic import search_url_for

_TIKTOK_DEFAULT_QUERIES = [
    "controlador midi",
    "teclado midi comprar",
    "drum pad midi",
    "home studio midi",
    "bateria electronica departamento",
    "produccion musical midi",
    "kressmer bateria",
    "MidiPlus controlador",
]


def _tiktok_dismiss_login_wall(client: CDPClient) -> bool:
    """Intenta cerrar el modal de login. Devuelve True si sigue habiendo login wall."""
    evaluate(client, """
    (() => {
      const closeBtn = document.querySelector(
        '[data-e2e="modal-close-inner-button"], [aria-label="Close"], button[class*="CloseButton"], [class*="close-btn"]'
      );
      if (closeBtn) { closeBtn.click(); return 'clicked_close'; }
      document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
      return 'pressed_escape';
    })()
    """)
    time.sleep(3)
    return bool(evaluate(client, """
    !!(document.querySelector('[data-e2e="login-form"]') ||
       document.querySelector('input[name="username"]') ||
       location.href.includes('/login'))
    """))


def _tiktok_get_video_urls(client: CDPClient, max_videos: int) -> tuple[list[str], bool]:
    result = evaluate(client, f"""
    (() => {{
      const loginWall = !!(
        document.querySelector('[data-e2e="login-form"]') ||
        document.querySelector('input[name="username"]') ||
        location.href.includes('/login')
      );
      const anchors = Array.from(document.querySelectorAll('a[href*="/video/"]'));
      const urls = [];
      const seen = new Set();
      for (const a of anchors) {{
        if (urls.length >= {int(max_videos)}) break;
        const href = a.href.split('?')[0];
        if (!href || seen.has(href) || !/tiktok\\.com\\/@[^/]+\\/video\\//.test(href)) continue;
        seen.add(href);
        urls.push(href);
      }}
      return {{loginWall, urls, pageUrl: location.href, anchors: anchors.length}};
    }})()
    """) or {}
    return result.get("urls") or [], bool(result.get("loginWall"))


def _tiktok_extract_comments_from_video(client: CDPClient, video_url: str, max_comments: int) -> list[dict]:
    client.send("Page.navigate", {"url": video_url})
    time.sleep(5)
    evaluate(client, "window.scrollBy(0, 200)")
    time.sleep(2)

    video_title = evaluate(client, """
    (document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"], h1, [class*="video-meta-caption"]')
      ?.innerText || document.title || '').replace(/\\s+/g, ' ').trim().slice(0, 120)
    """) or ""

    expression = f"""
    (() => {{
      const out = [];
      const seen = new Set();
      const videoUrl = location.href.split('?')[0];
      const videoTitle = ({json.dumps(video_title)});

      const commentSelectors = [
        '[data-e2e="comment-level-1"]',
        '[data-e2e="comment-item-wrapper"]',
        'div[class*="CommentItemWrapper"]',
        'div[class*="DivCommentContentWrapper"]',
        'div[class*="comment-item"]',
        'div[class*="CommentListItem"]',
      ];
      let commentEls = [];
      for (const sel of commentSelectors) {{
        commentEls = Array.from(document.querySelectorAll(sel));
        if (commentEls.length > 0) break;
      }}

      for (const el of commentEls) {{
        if (out.length >= {int(max_comments)}) break;
        const textSelectors = [
          '[data-e2e="comment-level-1-item"]', '[data-e2e="comment-text"]',
          'p[class*="CommentText"]', 'span[class*="comment-text"]',
          'p', 'span[dir]',
        ];
        let text = '';
        for (const sel of textSelectors) {{
          const textEl = el.querySelector(sel);
          if (textEl) {{ text = (textEl.innerText || '').replace(/\\s+/g, ' ').trim(); break; }}
        }}
        if (!text) text = (el.innerText || '').replace(/\\s+/g, ' ').trim().split('\\n')[0];
        if (!text || text.length < 8) continue;

        const authorEl = el.querySelector(
          '[data-e2e="comment-username-1"], a[href*="/@"], [class*="username"], [class*="UserName"]'
        );
        const author = (authorEl?.innerText || authorEl?.href?.split('/@').pop()?.split('?')[0] || '').trim();

        const key = author + '::' + text.slice(0, 60);
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({{
          url: videoUrl + '#comment-' + out.length,
          context: text.slice(0, 1600),
          author,
          publishedTime: '',
          sourceType: 'tiktok_comment',
          title: videoTitle,
          videoUrl,
          videoTitle,
        }});
      }}
      return out;
    }})()
    """
    return evaluate(client, expression) or []


def extract_tiktok_items(client: CDPClient, query: str, max_items: int, videos_limit: int = 5) -> list[dict]:
    client.send("Page.navigate", {"url": search_url_for("tiktok", query)})
    time.sleep(6)
    evaluate(client, "window.scrollBy(0, 400)")
    time.sleep(2)

    video_urls: list[str] = []
    deadline = time.time() + 25
    while time.time() < deadline and len(video_urls) < videos_limit:
        urls, login_wall = _tiktok_get_video_urls(client, videos_limit)
        print(f"[tiktok] búsqueda '{query}': {len(urls)} videos encontrados, loginWall={login_wall}")
        if login_wall:
            print("[tiktok] Login wall detectado. Intentando descartar modal...")
            if _tiktok_dismiss_login_wall(client):
                print("[tiktok] Login wall persiste. Logueate en TikTok en el perfil NSTBrowser.")
                break
            print("[tiktok] Modal descartado, reintentando...")
            continue
        for u in urls:
            if u not in video_urls:
                video_urls.append(u)
        if len(video_urls) >= videos_limit or not urls:
            break
        evaluate(client, "window.scrollBy(0, 900)")
        time.sleep(2)

    if not video_urls:
        print("[tiktok] Sin videos, nada que extraer.")
        return []

    comments: list[dict] = []
    seen: set[str] = set()
    comments_per_video = max(2, max_items // len(video_urls))

    for video_url in video_urls:
        if len(comments) >= max_items:
            break
        print(f"[tiktok] Extrayendo comentarios de: {video_url}")
        raw = _tiktok_extract_comments_from_video(client, video_url, comments_per_video)
        for item in raw:
            key = item.get("url", "")
            if key and key not in seen:
                seen.add(key)
                comments.append(item)
        print(f"[tiktok] {len(raw)} comentarios en este video, total acumulado: {len(comments)}")

    if not comments:
        print("[tiktok] Sin comentarios extraídos, devolviendo descripciones de videos como fallback.")
        client.send("Page.navigate", {"url": search_url_for("tiktok", query)})
        time.sleep(5)
        fallback_urls, _ = _tiktok_get_video_urls(client, max_items)
        for href in fallback_urls[:max_items]:
            comments.append({
                "url": href, "title": "", "author": "",
                "context": "", "publishedTime": "",
                "sourceType": "tiktok_video", "videoUrl": href, "videoTitle": "",
            })

    return comments[:max_items]
