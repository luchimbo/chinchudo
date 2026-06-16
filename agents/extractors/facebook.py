import json
import time

from _cdp import CDPClient, evaluate
from extractors.generic import search_url_for

_FB_DEFAULT_GROUPS = [
    "828346141416525",  # Productores Musicales de ARGENTINA (público, 4.1K)
    "556891734381036",  # Productores Musicales Latinoamérica
    "1540559426226001",  # Beatmakers & Productores - Habla Hispana
    "695879310471035",   # Home Studio Argentina
    "2212345678901234",  # Productores de Música Electrónica Argentina (agregar ID real si existe)
    # Nota: verificar membresía activa antes de agregar; los IDs inválidos se saltean silenciosamente
]

_FB_ARTICLE_EXTRACTOR = """
(() => {{
  const maxItems = {max_items};
  const urlFilter = {url_filter};
  const SKIP = /^(me gusta|like|comentar|comment|compartir|share|responder|reply|ver\\s|see\\s|seguir|\\d+\\s*(h|d|m|min|hora|d\\u00eda|sem|w|s)$|hoy|ayer)/i;
  const out = [];
  const seenUrls = new Set();
  const seenTexts = new Set();

  function isPostLink(href) {{
    if (!href) return false;
    return (
      href.includes('/posts/') ||
      href.includes('/permalink/') ||
      href.includes('story_fbid=') ||
      href.includes('?fbid=') ||
      /\\/groups\\/[^/]+\\/permalink\\//.test(href) ||
      /\\/groups\\/[^/]+\\/posts\\//.test(href)
    );
  }}

  for (const art of document.querySelectorAll('[role="article"]')) {{
    if (out.length >= maxItems) break;
    if (!art.innerText?.trim()) continue;

    const allLinks = Array.from(art.querySelectorAll('a[href]'))
      .filter(a => isPostLink(a.href) && !a.href.includes('/photos/') && !a.href.includes('/videos/'));
    const postLink = urlFilter === 'groups'
      ? (allLinks.find(a => a.href.includes('/groups/')) || allLinks[0])
      : (allLinks[0] || null);

    let url = postLink?.href?.split('?')[0] || '';
    if (!url && urlFilter === 'groups') {{
      const anyLink = art.querySelector('a[href*="facebook.com"]');
      url = anyLink?.href?.split('?')[0] || '';
    }}
    if (!url) continue;
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let text = '';
    const specificTextEl = art.querySelector('[data-testid="post_message"], [data-ad-comet-preview="message"]');
    if (specificTextEl) {{
      text = specificTextEl.innerText.replace(/\\s+/g, ' ').trim();
    }}
    if (!text) {{
      const postTextEls = Array.from(art.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
        .filter(el => {{
          let p = el.parentElement;
          while (p && p !== art) {{
            if (p.getAttribute('role') === 'article') return false;
            p = p.parentElement;
          }}
          return true;
        }});
      const candidates = postTextEls
        .map(el => (el.innerText||'').replace(/\\s+/g,' ').trim())
        .filter(t => t.length > 20 && !SKIP.test(t));
      text = candidates.sort((a, b) => b.length - a.length)[0] || '';
    }}
    if (text.length < 20) continue;

    const textKey = text.slice(0, 80);
    if (seenTexts.has(textKey)) continue;
    seenTexts.add(textKey);

    const author = art.querySelector('h2 a, strong a, [role="link"] > span, h3 a')?.innerText?.trim() || '';
    const tsEl = art.querySelector('time[datetime], abbr[data-utime], a[href*="/posts/"] span[aria-label]');
    const publishedTime = tsEl?.getAttribute('datetime') || tsEl?.getAttribute('aria-label') || tsEl?.innerText?.trim() || '';

    out.push({{
      url,
      context: text.slice(0, 1600),
      author,
      publishedTime,
      sourceType: 'facebook_post',
      title: text.slice(0, 120),
      videoUrl: url,
      videoTitle: '',
    }});
  }}
  return out;
}})()
"""

_FB_COMMENT_EXTRACTOR = """
(() => {{
  const maxItems = {max_items};
  const postUrl = {post_url};
  const postText = {post_text};
  const out = [];
  const seen = new Set();

  const commentSelectors = [
    '[aria-label*="Comentario"] [dir="auto"]',
    'div[data-testid="UFI2Comment/body"] [dir="auto"]',
    'div[role="article"] div[dir="auto"]',
    'ul li div[dir="auto"]',
  ];
  let commentEls = [];
  for (const sel of commentSelectors) {{
    commentEls = Array.from(document.querySelectorAll(sel));
    if (commentEls.length > 2) break;
  }}

  if (commentEls.length === 0) {{
    commentEls = Array.from(document.querySelectorAll('[dir="auto"]'))
      .filter(el => {{
        const t = (el.innerText || '').trim();
        return t.length > 10 && t.length < 800 && !postText.startsWith(t.slice(0,30));
      }});
  }}

  const SKIP = /^(me gusta|like|responder|reply|ver más|see more|seguir|compartir|share|\\d+\\s*(h|d|m|min|w|sem)$)/i;
  for (const el of commentEls) {{
    if (out.length >= maxItems) break;
    const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
    if (!text || text.length < 10 || SKIP.test(text)) continue;
    if (text === postText.slice(0, text.length)) continue;

    const authorEl = el.closest('li, [role="article"]')?.querySelector('a[href*="facebook.com"], strong a, h3 a');
    const author = authorEl?.innerText?.trim() || '';

    const key = (author || 'anon') + '::' + text.slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({{
      url: postUrl + '#comment-' + out.length,
      context: text.slice(0, 1600),
      author,
      publishedTime: el.closest('li, [role="article"]')?.querySelector('a[role="link"] span[aria-label], abbr[data-utime]')?.getAttribute('aria-label') || '',
      sourceType: 'facebook_comment',
      title: text.slice(0, 120),
      videoUrl: postUrl,
      videoTitle: postText.slice(0, 120),
    }});
  }}
  return out;
}})()
"""


def _fb_extract(client: CDPClient, seen: set, items: list, max_items: int, url_filter: str) -> None:
    remaining = int(max_items - len(items))
    js_filter = f'"{url_filter}"'
    expression = _FB_ARTICLE_EXTRACTOR.format(max_items=remaining, url_filter=js_filter)
    for item in evaluate(client, expression) or []:
        key = item.get("url") or f"{item.get('author')}::{(item.get('context') or '')[:60]}"
        if key in seen:
            continue
        seen.add(key)
        items.append(item)
        if len(items) >= max_items:
            break


def _fb_extract_post_comments(client: CDPClient, post_url: str, post_text: str, max_comments: int, seen: set) -> list[dict]:
    client.send("Page.navigate", {"url": post_url})
    time.sleep(6)
    for _ in range(4):
        evaluate(client, "window.scrollBy(0, 700)")
        time.sleep(1.5)
    expression = _FB_COMMENT_EXTRACTOR.format(
        max_items=int(max_comments),
        post_url=json.dumps(post_url),
        post_text=json.dumps(post_text[:200]),
    )
    results = evaluate(client, expression) or []
    out = []
    for item in results:
        key = item.get("url", "") + item.get("context", "")[:40]
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out


def extract_facebook_post_items(client: CDPClient, query: str, max_items: int) -> list[dict]:
    # Soporta "query |groups:ID1,ID2" para especificar grupos desde social-listen
    groups = _FB_DEFAULT_GROUPS
    if "|groups:" in query:
        parts = query.split("|groups:")
        if len(parts) > 1:
            groups = [g.strip() for g in parts[1].split(",") if g.strip()]
            query = parts[0].strip()

    posts: list[dict] = []
    seen: set[str] = set()

    client.send("Page.navigate", {"url": search_url_for("facebook", query)})
    time.sleep(8)
    for _ in range(6):
        evaluate(client, "window.scrollBy(0, 900)")
        time.sleep(2)
    _fb_extract(client, seen, posts, max_items * 3, "any")
    print(f"[facebook] búsqueda keyword: {len(posts)} posts encontrados")

    for group_id in groups:
        client.send("Page.navigate", {"url": f"https://www.facebook.com/groups/{group_id}/"})
        time.sleep(8)
        result_check = evaluate(client, "location.href") or ""
        if "login" in result_check.lower():
            print(f"[facebook] grupo {group_id}: redirigido a login, saltando")
            continue
        for _ in range(6):
            evaluate(client, "window.scrollBy(0, 900)")
            time.sleep(2)
        _fb_extract(client, seen, posts, max_items * 3, "groups")
        print(f"[facebook] grupo {group_id}: {len(posts)} posts acumulados")

    items: list[dict] = []
    comments_per_post = max(3, max_items // max(1, len(posts)))
    items_seen: set[str] = set()

    for post in posts:
        if len(items) >= max_items:
            break
        post_url = post.get("url", "")
        post_text = post.get("context", "")

        post_key = post_url + post_text[:40]
        if post_key not in items_seen:
            items_seen.add(post_key)
            items.append(post)

        if post_url and len(items) < max_items:
            print(f"[facebook] extrayendo comentarios de: {post_url}")
            comments = _fb_extract_post_comments(client, post_url, post_text, comments_per_post, items_seen)
            print(f"[facebook] {len(comments)} comentarios en este post")
            items.extend(comments[:max(0, max_items - len(items))])

    return items[:max_items]
