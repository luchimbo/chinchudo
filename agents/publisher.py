import argparse
import importlib.util
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _log import get_logger  # noqa: E402

log = get_logger("publisher")

browser_path = Path(__file__).resolve().parent / "browser-cdp.py"
spec = importlib.util.spec_from_file_location("browser_cdp", browser_path)
browser_cdp = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(browser_cdp)


_PLACEHOLDER_SEL = (
    "ytd-comment-simplebox-renderer #placeholder-area, "
    "ytd-comment-simplebox-renderer yt-formatted-string#simplebox-placeholder, "
    "#simplebox-placeholder, "
    "#placeholder-area, "
    "ytd-comments #placeholder-area, "
    "#comments #placeholder-area"
)
_COMMENTBOX_SEL = '#contenteditable-root[contenteditable="true"]'
_SUBMIT_SEL = (
    "ytd-comment-simplebox-renderer #submit-button button, "
    "ytd-commentbox #submit-button button, "
    "ytd-button-renderer#submit-button button, "
    "#submit-button yt-button-shape button, "
    "#submit-button:not([disabled]) button"
)
# El composer de respuesta en YouTube actual es `ytd-commentbox` dentro de
# `ytd-comment-replies-renderer` (el viejo `ytd-comment-reply-dialog-renderer` ya no existe).
# Submit acotado a esa caja de reply y solo botones habilitados (no el simplebox top-level).
_REPLY_SUBMIT_SEL = (
    "ytd-comment-replies-renderer ytd-commentbox #submit-button button:not([disabled]), "
    "ytd-comment-thread-renderer[is-highlighted] ytd-commentbox #submit-button button:not([disabled]), "
    'ytd-commentbox #submit-button button[aria-label*="esponder" i]:not([disabled])'
)
_REPLY_INPUT_SEL = (
    'ytd-comment-replies-renderer ytd-commentbox #contenteditable-root[contenteditable="true"], '
    'ytd-comment-thread-renderer[is-highlighted] ytd-commentbox #contenteditable-root[contenteditable="true"], '
    'ytd-commentbox #contenteditable-root[contenteditable="true"], '
    '#contenteditable-root[contenteditable="true"]'
)
# Scroll suave para forzar render lazy de YouTube entre reintentos.
_YT_NUDGE_JS = """
(() => {
  const c = document.querySelector('#comments, ytd-comments');
  if (c) c.scrollIntoView({behavior: 'instant', block: 'start'});
  window.scrollTo(0, (document.documentElement.scrollHeight || document.body.scrollHeight));
})()
"""


def _yt_wait_for_page(client, timeout: int = 20) -> bool:
    """Wait until ytd-watch-flexy is in the DOM (page fully initialized)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        found = browser_cdp.evaluate(client, "!!document.querySelector('ytd-watch-flexy')")
        if found:
            return True
        time.sleep(1)
    return False


def _yt_scroll_to_comments(client, timeout: int = 30) -> bool:
    """
    Scroll until the comment box or comment threads appear.
    Returns True once comments are loaded.
    YouTube lazy-loads comments; we try several scroll strategies.
    """
    scroll_js = """
    (() => {
      // Try scrollIntoView on comments container first
      const c = document.querySelector('#comments, ytd-comments');
      if (c) c.scrollIntoView({behavior: 'instant', block: 'start'});
      // Also push window / html / body scroll
      const total = Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight,
        document.body.offsetHeight
      );
      window.scrollTo(0, total);
      document.documentElement.scrollTop = total;
      document.body.scrollTop = total;
    })()
    """
    check_js = """
    (() => ({
      simplebox: !!document.querySelector(%s),
      threads: document.querySelectorAll('ytd-comment-thread-renderer').length
    }))()
    """ % json.dumps(_PLACEHOLDER_SEL)

    _yt_wait_for_page(client)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            browser_cdp.evaluate(client, scroll_js)
        except Exception:
            pass  # scroll es best-effort; YouTube puede tirar excepciones internas
        time.sleep(1.5)
        try:
            r = browser_cdp.evaluate(client, check_js)
        except Exception:
            r = None
        if r and (r.get("simplebox") or r.get("threads", 0) > 0):
            return True
    return False


def _yt_retry(client, js: str, attempts: int | None = None, delay: float | None = None, nudge: bool = False) -> dict | None:
    """Re-evalúa `js` hasta que devuelva {ok:true}; reintenta con backoff exponencial.
    Con nudge=True hace scroll antes de cada intento para forzar render lazy.
    Parámetros sobreescribibles via env: RETRY_ATTEMPTS, RETRY_BASE_DELAY."""
    _attempts = attempts if attempts is not None else int(os.environ.get("RETRY_ATTEMPTS", "6"))
    _base = delay if delay is not None else float(os.environ.get("RETRY_BASE_DELAY", "1.3"))
    _max = float(os.environ.get("RETRY_MAX_DELAY", "20.0"))
    import random
    result = None
    for i in range(_attempts):
        if nudge:
            browser_cdp.evaluate(client, _YT_NUDGE_JS)
        result = browser_cdp.evaluate(client, js)
        if result and result.get("ok"):
            return result
        if i < _attempts - 1:
            wait = min(_base * (2 ** i) + random.uniform(0, 0.5), _max)
            log.debug("yt_retry esperando", attempt=i + 1, wait=round(wait, 2), error=(result or {}).get("error"))
            time.sleep(wait)
    if result and result.get("error"):
        log.warning("yt_retry agotado", attempts=_attempts, error=result.get("error"))
    return result


def _yt_verify_submitted(client, verify_js: str, attempts: int = 6, delay: float = 1.5) -> bool:
    """True si `verify_js` confirma el envío ({ok:true}) dentro del tiempo dado."""
    import random
    for i in range(attempts):
        r = browser_cdp.evaluate(client, verify_js)
        if r and r.get("ok"):
            return True
        if i < attempts - 1:
            wait = min(delay * (2 ** i) + random.uniform(0, 0.3), 15.0)
            time.sleep(wait)
    return False


def _yt_post_toplevel(client, page_url: str, text: str) -> dict:
    """Post a top-level comment on the video (con reintentos y verificación)."""
    log.info("yt_post_toplevel iniciando", url=page_url, chars=len(text))
    _yt_scroll_to_comments(client)

    click_js = f"""
    (() => {{
      const placeholder = document.querySelector({json.dumps(_PLACEHOLDER_SEL)});
      if (!placeholder) return {{error: 'no_comment_box'}};
      placeholder.click();
      return {{ok: true}};
    }})()
    """
    r = _yt_retry(client, click_js, attempts=10, delay=1.5, nudge=True)
    if not (r and r.get("ok")):
        return {"success": False, "error": (r or {}).get("error", "no_comment_box")}

    time.sleep(1.2)

    insert_js = f"""
    (() => {{
      const box = document.querySelector({json.dumps(_COMMENTBOX_SEL)});
      if (!box) return {{error: 'no_input_box'}};
      box.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, {json.dumps(text)});
      box.dispatchEvent(new Event('input', {{bubbles: true}}));
      return (box.innerText.trim().length > 0)
        ? {{ok: true, length: box.innerText.trim().length}}
        : {{error: 'empty_box'}};
    }})()
    """
    r = _yt_retry(client, insert_js, attempts=3, delay=1.0)
    if not (r and r.get("ok")):
        return {"success": False, "error": (r or {}).get("error", "no_input_box")}

    time.sleep(0.6)

    submit_js = f"""
    (() => {{
      const sel = {json.dumps(_SUBMIT_SEL)};
      const btn = document.querySelector(sel);
      if (!btn) return {{error: 'no_submit_button'}};
      btn.click();
      return {{ok: true}};
    }})()
    """
    r = _yt_retry(client, submit_js, attempts=4, delay=1.0)
    if not (r and r.get("ok")):
        return {"success": False, "error": (r or {}).get("error", "no_submit_button")}

    # Verificar envío: el editor del simplebox se vacía/colapsa tras publicar.
    verify_js = """
    (() => {
      const box = document.querySelector('ytd-comment-simplebox-renderer #contenteditable-root');
      return (!box || box.innerText.trim().length === 0) ? {ok: true} : {error: 'still_filled'};
    })()
    """
    if not _yt_verify_submitted(client, verify_js):
        log.error("yt_post_toplevel submit sin confirmar", url=page_url)
        return {"success": False, "error": "submit_unconfirmed"}

    log.info("yt_post_toplevel OK", url=page_url)
    return {"success": True, "url": page_url, "type": "top_level"}


def _yt_wait_for_highlighted_comment(client, comment_id: str, timeout: int = 30) -> bool:
    """
    Poll until the highlighted comment thread appears in the DOM.
    Also keeps scrolling toward comments to trigger lazy loading.
    """
    scroll_js = """
    (() => {
      const ht = document.querySelector('ytd-comment-thread-renderer[is-highlighted]');
      if (ht) return;
      const c = document.querySelector('#comments, ytd-comments');
      if (c) c.scrollIntoView({behavior: 'instant', block: 'start'});
      window.scrollTo(0, document.body.scrollHeight || document.documentElement.scrollHeight);
      document.documentElement.scrollTop = 99999;
      document.body.scrollTop = 99999;
    })()
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        browser_cdp.evaluate(client, scroll_js)
        result = browser_cdp.evaluate(client, f"""
        (() => {{
          const cid = {json.dumps(comment_id)};
          if (document.querySelector('ytd-comment-thread-renderer[is-highlighted]')) return true;
          for (const t of document.querySelectorAll('ytd-comment-thread-renderer')) {{
            if (t.innerHTML.includes(cid)) return true;
          }}
          return false;
        }})()
        """)
        if result:
            return True
        time.sleep(1.5)
    return False


def _yt_reply_to_comment(client, page_url: str, comment_id: str, text: str) -> dict:
    """Reply to a specific comment identified by its lc= ID (con reintentos)."""
    _yt_wait_for_highlighted_comment(client, comment_id)

    # Encontrar el thread destacado y clickear "Responder" — con reintentos,
    # porque la barra de acciones del comentario hidrata de forma asíncrona.
    reply_click_js = f"""
    (() => {{
      const cid = {json.dumps(comment_id)};
      let thread = document.querySelector('ytd-comment-thread-renderer[is-highlighted]');
      if (!thread) {{
        for (const t of document.querySelectorAll('ytd-comment-thread-renderer')) {{
          if (t.innerHTML.includes(cid)) {{ thread = t; break; }}
        }}
      }}
      if (!thread) return {{error: 'comment_not_found'}};
      thread.scrollIntoView({{behavior: 'instant', block: 'center'}});
      const btn = thread.querySelector(
        '#reply-button-end button, ytd-button-renderer#reply-button-end button, ' +
        'button[aria-label*="Reply" i], button[aria-label*="esponder" i]'
      );
      if (!btn) return {{error: 'no_reply_button'}};
      btn.click();
      return {{ok: true}};
    }})()
    """
    r = None
    for _ in range(10):
        browser_cdp.evaluate(client, _YT_NUDGE_JS)
        r = browser_cdp.evaluate(client, reply_click_js)
        if r and r.get("ok"):
            break
        time.sleep(1.5)
    if not (r and r.get("ok")):
        if r and r.get("error") == "comment_not_found":
            # Comentario no renderizado (paginado/colapsado) → comentario nuevo
            return _yt_post_toplevel(client, page_url, text)
        return {"success": False, "error": (r or {}).get("error", "no_reply_button")}

    time.sleep(2.0)

    # Insertar el texto en el cuadro de respuesta (poll + verificación de no-vacío).
    insert_js = f"""
    (() => {{
      const sel = {json.dumps(_REPLY_INPUT_SEL)};
      const boxes = Array.from(document.querySelectorAll(sel));
      const box = boxes[boxes.length - 1];
      if (!box) return {{error: 'no_reply_input'}};
      box.scrollIntoView({{block: 'center'}});
      box.focus();
      document.execCommand('selectAll', false);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, {json.dumps(text)});
      box.dispatchEvent(new Event('input', {{bubbles: true}}));
      return (box.innerText.trim().length > 0)
        ? {{ok: true, length: box.innerText.trim().length}}
        : {{error: 'empty_reply_input'}};
    }})()
    """
    r = _yt_retry(client, insert_js, attempts=5, delay=1.5)
    if not (r and r.get("ok")):
        return {"success": False, "error": (r or {}).get("error", "no_reply_input")}

    time.sleep(0.8)

    submit_js = f"""
    (() => {{
      const sel = {json.dumps(_REPLY_SUBMIT_SEL)};
      const btns = Array.from(document.querySelectorAll(sel)).filter(b => {{
        const rc = b.getBoundingClientRect();
        return rc.width > 0 && rc.height > 0 && !b.disabled;
      }});
      if (!btns.length) return {{error: 'no_reply_submit'}};
      const btn = btns[btns.length - 1];
      // Click con eventos de mouse reales (el .click() simple a veces no dispara el handler de YT)
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t =>
        btn.dispatchEvent(new MouseEvent(t, {{bubbles: true, cancelable: true, view: window}})));
      return {{ok: true}};
    }})()
    """
    r = _yt_retry(client, submit_js, attempts=4, delay=1.5)
    if not (r and r.get("ok")):
        return {"success": False, "error": (r or {}).get("error", "no_reply_submit")}

    # Verificar envío: la caja de respuesta (ytd-commentbox del reply) se cierra o se vacía.
    verify_js = """
    (() => {
      const box = document.querySelector(
        'ytd-comment-replies-renderer ytd-commentbox #contenteditable-root, ' +
        'ytd-comment-thread-renderer[is-highlighted] ytd-commentbox #contenteditable-root'
      );
      return (!box || box.innerText.trim().length === 0) ? {ok: true} : {error: 'still_filled'};
    })()
    """
    if not _yt_verify_submitted(client, verify_js):
        return {"success": False, "error": "submit_unconfirmed"}

    return {"success": True, "url": page_url, "type": "reply", "comment_id": comment_id}


def _poll_login(client, js: str, retries: int = 4, interval: float = 2.0) -> dict:
    """Evalúa `js` hasta `retries` veces con `interval` segundos entre intentos.
    Devuelve el primer resultado con loggedIn=True, o el último resultado si agota intentos."""
    result: dict = {}
    for attempt in range(retries):
        try:
            result = browser_cdp.evaluate(client, js) or {}
        except Exception:
            result = {}
        if result.get("loggedIn"):
            return result
        if attempt < retries - 1:
            time.sleep(interval)
    return result


def _yt_logged_in(client) -> bool:
    """Detecta sesión activa en YouTube. Usa señal positiva (avatar presente)
    y negativa (botón Sign In ausente), con reintentos para tolerar carga lenta."""
    js = """
    (() => {
      const signIn = document.querySelector(
        'a[aria-label*="Sign in" i], a[aria-label*="Acceder" i], ' +
        'tp-yt-paper-button[aria-label*="Sign in" i], ' +
        'ytd-button-renderer a[href*="ServiceLogin"], ' +
        'a[href*="accounts.google.com/ServiceLogin"]'
      );
      const avatar = document.querySelector(
        'button#avatar-btn, yt-img-shadow#avatar img, ytd-topbar-menu-button-renderer #avatar-btn'
      );
      // Logueado si hay avatar O si no hay botón de login y la página cargó
      const pageLoaded = !!document.querySelector('ytd-watch-flexy, ytd-browse');
      return {loggedIn: (!!avatar || (!signIn && pageLoaded))};
    })()
    """
    r = _poll_login(client, js)
    return bool(r.get("loggedIn"))


def post_youtube_comment(client, video_url: str, text: str, dry_run: bool) -> dict:
    lc_match = re.search(r'[?&]lc=([A-Za-z0-9_-]+)', video_url)
    comment_id = lc_match.group(1) if lc_match else None

    # Keep lc= so YouTube highlights and scrolls to the target comment
    clean_url = video_url.split("#")[0]
    client.send("Page.navigate", {"url": clean_url})
    # Wait for ytd-watch-flexy to confirm the page initialized
    time.sleep(5)
    _yt_wait_for_page(client, timeout=15)

    if dry_run:
        mode = "reply" if comment_id else "top_level"
        return {"success": True, "dry_run": True, "url": clean_url, "mode": mode}

    # Chequeo de login previo: error claro en vez de no_comment_box/no_reply_button
    if not _yt_logged_in(client):
        return {"success": False, "error": "not_logged_in"}

    if comment_id:
        return _yt_reply_to_comment(client, clean_url, comment_id, text)
    return _yt_post_toplevel(client, clean_url, text)


def post_reddit_reply(client, comment_url: str, text: str, dry_run: bool) -> dict:
    old_url = comment_url.replace("www.reddit.com", "old.reddit.com").replace("://reddit.com/", "://old.reddit.com/")
    if "old.reddit.com" not in old_url:
        old_url = old_url.replace("reddit.com/r/", "old.reddit.com/r/")
    # Strip fragment so we land on the right thread
    thread_url = old_url.split("#")[0]

    client.send("Page.navigate", {"url": thread_url})
    time.sleep(3)

    if dry_run:
        return {"success": True, "dry_run": True, "url": thread_url}

    # Verify login — mirrors the check in _login.py (LOGIN_CHECKS["reddit"]), con reintentos
    auth = _poll_login(client, """
    (() => {
      const u = document.querySelector('.user a.reddit-user-link') ||
                document.querySelector('#header-bottom-right .user a') ||
                document.querySelector('.user a');
      const user = (u?.innerText || u?.textContent || '').trim();
      const loggedIn = !!user && !/login|register|conect/i.test(user);
      return {loggedIn, user};
    })()
    """)
    if not auth or not auth.get("loggedIn"):
        return {"success": False, "error": "not_logged_in", "user": (auth or {}).get("user", "")}

    # Extract comment ID from URL fragment or last path segment
    fragment = comment_url.split("#")[-1] if "#" in comment_url else ""
    path_parts = [p for p in old_url.split("?")[0].split("/") if p]
    comment_id = fragment or (path_parts[-1] if len(path_parts) > 4 else "")

    # Find the reply button for the specific comment, fallback to OP reply
    result = browser_cdp.evaluate(client, f"""
    (() => {{
      const commentId = {json.dumps(comment_id)};
      let replyBtn = null;
      if (commentId) {{
        const node = document.querySelector('[data-fullname="t1_' + commentId + '"]') ||
                     document.querySelector('[data-fullname="' + commentId + '"]');
        if (node) replyBtn = node.querySelector('a.reply-button, li.reply-button a');
      }}
      if (!replyBtn) {{
        replyBtn = document.querySelector('.thing.link ~ .commentarea .reply-button a') ||
                   document.querySelector('.commentarea .reply-button a');
      }}
      if (!replyBtn) return {{error: 'no_reply_button'}};
      replyBtn.click();
      return {{ok: true, id: commentId}};
    }})()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(1)

    result = browser_cdp.evaluate(client, f"""
    (() => {{
      const textarea = document.querySelector('.usertext-edit textarea, .commentreply textarea');
      if (!textarea) return {{error: 'no_textarea'}};
      textarea.focus();
      textarea.value = {json.dumps(text)};
      textarea.dispatchEvent(new Event('input', {{bubbles: true}}));
      return {{ok: true}};
    }})()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(0.5)

    result = browser_cdp.evaluate(client, """
    (() => {
      const btn = document.querySelector(
        '.usertext-edit button[type="submit"], .commentreply button[type="submit"]'
      );
      if (!btn) return {error: 'no_submit_button'};
      btn.click();
      return {ok: true};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(2)
    return {"success": True, "url": thread_url}


def post_x_reply(client, tweet_url: str, text: str, dry_run: bool) -> dict:
    client.send("Page.navigate", {"url": tweet_url})
    time.sleep(4)

    if dry_run:
        return {"success": True, "dry_run": True, "url": tweet_url}

    # Verificar login — señal positiva (sidebar de perfil) + negativa (URL de login), con reintentos
    auth = _poll_login(client, """
    (() => {
      const onLoginPage = location.href.includes('/i/flow/login') || location.href.includes('/login');
      const profileBtn = !!(
        document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]') ||
        document.querySelector('[data-testid="AppTabBar_Profile_Link"]') ||
        document.querySelector('[data-testid="primaryColumn"]')
      );
      return {loggedIn: !onLoginPage && profileBtn};
    })()
    """)
    if not auth or not auth.get("loggedIn"):
        return {"success": False, "error": "not_logged_in"}

    # Click reply button
    result = browser_cdp.evaluate(client, """
    (() => {
      const btn = document.querySelector('[data-testid="reply"]');
      if (!btn) return {error: 'no_reply_button'};
      btn.click();
      return {ok: true};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(1.5)

    # Escribir el texto en el compose box
    result = browser_cdp.evaluate(client, f"""
    (() => {{
      const textarea = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!textarea) return {{error: 'no_textarea'}};
      textarea.focus();
      document.execCommand('insertText', false, {json.dumps(text)});
      return {{ok: true, chars: textarea.innerText?.length || 0}};
    }})()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(0.5)

    # Submit
    result = browser_cdp.evaluate(client, """
    (() => {
      const btn = document.querySelector(
        '[data-testid="tweetButtonInline"]:not([disabled]) div[role="button"], ' +
        '[data-testid="tweetButtonInline"]:not([disabled]), ' +
        '[data-testid="tweetButton"]:not([disabled])'
      );
      if (!btn) return {error: 'no_submit_button'};
      btn.click();
      return {ok: true};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(2)
    return {"success": True, "url": tweet_url}


def post_facebook_comment(client, post_url: str, text: str, dry_run: bool) -> dict:
    import re as _re
    # Reels → Watch URL para poder comentar desde la vista de video completa
    watch_url = post_url
    reel_m = _re.search(r'/reel/(\d+)', post_url)
    if reel_m:
        watch_url = f"https://www.facebook.com/watch/?v={reel_m.group(1)}"

    client.send("Page.navigate", {"url": watch_url})
    time.sleep(5)

    if dry_run:
        return {"success": True, "dry_run": True, "url": watch_url}

    # Verificar login — señal positiva (navbar logueado) + negativa (form de login), con reintentos
    auth = _poll_login(client, """
    (() => {
      const loginForm = !!(
        document.querySelector('input[name="email"], #email') &&
        document.querySelector('input[name="pass"], #pass')
      );
      const onLoginPage = location.href.includes('/login') || location.href.includes('login_attempt');
      const loggedInNav = !!(
        document.querySelector('[aria-label="Facebook"][role="navigation"]') ||
        document.querySelector('[data-pagelet="LeftRail"]') ||
        document.querySelector('[data-pagelet="ProfileAppSection_0"]') ||
        document.querySelector('div[role="banner"] a[href*="/me"]')
      );
      return {loggedIn: !loginForm && !onLoginPage && loggedInNav};
    })()
    """)
    if not auth or not auth.get("loggedIn"):
        return {"success": False, "error": "not_logged_in"}

    # Scroll para que cargue la sección de comentarios
    browser_cdp.evaluate(client, "window.scrollBy(0, 600)")
    time.sleep(1.5)

    # Activar el input de comentario:
    # En Watch/posts normales el contenteditable ya está visible.
    # En posts de grupos puede estar colapsado.
    result = browser_cdp.evaluate(client, """
    (() => {
      const box = document.querySelector('div[contenteditable="true"]');
      if (box) { box.click(); box.focus(); return {ok: true, path: 'direct'}; }
      // Botón "Comentar" colapsado
      const btn = Array.from(document.querySelectorAll('div[role="button"], a[role="button"]'))
        .find(b => /comentar|comment/i.test(b.getAttribute('aria-label') || b.innerText || ''));
      if (btn) { btn.click(); return {ok: true, path: 'activator'}; }
      return {error: 'no_comment_box'};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(1.5)

    # Escribir el texto
    result = browser_cdp.evaluate(client, f"""
    (() => {{
      const box = document.querySelector('div[contenteditable="true"]');
      if (!box) return {{error: 'no_box_for_text'}};
      box.focus();
      document.execCommand('insertText', false, {json.dumps(text)});
      return {{ok: true, chars: box.innerText?.length || 0}};
    }})()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(0.5)

    # Submit: primero buscar botón "Publicar comentario", luego Enter como fallback
    result = browser_cdp.evaluate(client, """
    (() => {
      const submitBtn = document.querySelector(
        'div[aria-label="Publicar comentario"], ' +
        'div[aria-label="Post comment"], ' +
        'button[aria-label="Publicar comentario"]'
      );
      if (submitBtn) { submitBtn.click(); return {ok: true, via: 'button'}; }
      // Fallback Enter
      const box = document.querySelector('div[contenteditable="true"]');
      if (!box) return {error: 'no_box_for_submit'};
      box.dispatchEvent(new KeyboardEvent('keydown',  {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true}));
      box.dispatchEvent(new KeyboardEvent('keypress', {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true}));
      box.dispatchEvent(new KeyboardEvent('keyup',    {key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true}));
      return {ok: true, via: 'enter'};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(2)
    return {"success": True, "url": watch_url}


def post_instagram_comment(client, post_url: str, text: str, dry_run: bool) -> dict:
    client.send("Page.navigate", {"url": post_url})
    time.sleep(5)

    if dry_run:
        return {"success": True, "dry_run": True, "url": post_url}

    # Verificar login — señal positiva (nav de usuario) + negativa (form login), con reintentos
    auth = _poll_login(client, """
    (() => {
      const onLoginPage = location.href.includes('/accounts/login');
      const loginForm = !!document.querySelector('input[name="username"]');
      const loggedInNav = !!(
        document.querySelector('a[href="/direct/inbox/"]') ||
        document.querySelector('svg[aria-label="Home"]') ||
        document.querySelector('a[href*="/explore/"]') ||
        document.querySelector('[data-testid="user-avatar"]') ||
        document.querySelector('nav a[href^="/@"]') ||
        document.querySelector('span[role="link"]')
      );
      return {loggedIn: !onLoginPage && !loginForm && loggedInNav};
    })()
    """)
    if not auth or not auth.get("loggedIn"):
        return {"success": False, "error": "not_logged_in"}

    # Click en el área de comentario
    result = browser_cdp.evaluate(client, """
    (() => {
      const textarea = document.querySelector(
        'textarea[aria-label*="comment" i], ' +
        'textarea[placeholder*="comment" i], ' +
        'textarea[placeholder*="comentario" i]'
      );
      if (!textarea) return {error: 'no_comment_textarea'};
      textarea.click();
      textarea.focus();
      return {ok: true};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(1)

    # Escribir el texto
    result = browser_cdp.evaluate(client, f"""
    (() => {{
      const textarea = document.querySelector(
        'textarea[aria-label*="comment" i], ' +
        'textarea[placeholder*="comment" i], ' +
        'textarea[placeholder*="comentario" i]'
      );
      if (!textarea) return {{error: 'no_textarea_after_click'}};
      textarea.focus();
      document.execCommand('insertText', false, {json.dumps(text)});
      textarea.dispatchEvent(new Event('input', {{bubbles: true}}));
      return {{ok: true, chars: textarea.value?.length || 0}};
    }})()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(0.5)

    # Submit: botón "Post" / "Publicar"
    result = browser_cdp.evaluate(client, """
    (() => {
      const btn = document.querySelector(
        'button[type="submit"]:not([disabled]), ' +
        'div[role="button"][tabindex="0"]:not([disabled])'
      );
      // Buscar específicamente el botón de publicar comentario
      const allBtns = Array.from(document.querySelectorAll('button, div[role="button"]'));
      const postBtn = allBtns.find(b => {
        const t = b.innerText?.toLowerCase() || b.getAttribute('aria-label')?.toLowerCase() || '';
        return (t.includes('post') || t.includes('publicar')) && !b.disabled;
      }) || btn;
      if (!postBtn) return {error: 'no_submit_button'};
      postBtn.click();
      return {ok: true};
    })()
    """)
    if result and result.get("error"):
        return {"success": False, "error": result["error"]}

    time.sleep(2)
    return {"success": True, "url": post_url}


def publish_comment(channel: str, account: str | None, source_url: str, text: str, dry_run: bool) -> dict:
    log.info("publish_comment inicio", channel=channel, account=account or "default", dry_run=dry_run, url=source_url)
    # Use a fresh dedicated tab so we don't hijack a tab that belongs to another platform.
    client, tab_id = browser_cdp.open_new_tab(account, timeout=30.0)
    try:
        client.send("Page.enable")
        client.send("Runtime.enable")
        if channel == "youtube":
            result = post_youtube_comment(client, source_url, text, dry_run)
        elif channel == "reddit":
            result = post_reddit_reply(client, source_url, text, dry_run)
        elif channel == "x":
            result = post_x_reply(client, source_url, text, dry_run)
        elif channel == "facebook":
            result = post_facebook_comment(client, source_url, text, dry_run)
        elif channel == "instagram":
            result = post_instagram_comment(client, source_url, text, dry_run)
        else:
            result = {"success": False, "error": f"channel_not_supported:{channel}"}

        if result.get("success"):
            log.info("publish_comment OK", channel=channel, account=account or "default", dry_run=dry_run)
        else:
            log.error("publish_comment FAIL", channel=channel, account=account or "default", error=result.get("error"))
        return result
    except Exception as exc:
        log.error("publish_comment excepcion", channel=channel, account=account or "default", error=str(exc))
        raise
    finally:
        client.__exit__(None, None, None)
        if tab_id:
            browser_cdp.close_tab(account, tab_id)


def main() -> None:
    parser = argparse.ArgumentParser(description="Publica respuestas via CDP")
    parser.add_argument("--channel", required=True, choices=["youtube", "reddit", "x", "facebook", "instagram"])
    parser.add_argument("--account", default="")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    result = publish_comment(
        channel=args.channel,
        account=args.account or None,
        source_url=args.source_url,
        text=args.text,
        dry_run=args.dry_run,
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
