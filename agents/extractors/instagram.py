import json
import time

from _cdp import CDPClient, evaluate

_IG_DEFAULT_HASHTAGS = [
    "controladorMIDI",
    "tecladoMIDI",
    "drumpad",
    "homerecording",
    "produccionmusical",
    "homestudio",
    "estudioencasa",
    "productormusical",
    "beatmaker",
    "musicproduction",
    "interfazdeaudio",
    "audiointerface",
    "sintetizador",
    "abletonlive",
    "flstudio",
    "logicpro",
    "grabacion",
    "musicaelectronica",
    "homemusic",
    "kressmer",
]

_IG_KEYWORD_MAP = {
    "controlador": "controladorMIDI",
    "teclado": "tecladoMIDI",
    "bateria": "drumpad",
    "drum": "drumpad",
    "produccion": "produccionmusical",
    "producción": "produccionmusical",
    "recording": "homerecording",
    "ableton": "abletonlive",
    "fl": "flstudio",
    "audio": "audiointerface",
    "interface": "audiointerface",
    "kressmer": "kressmer",
}

_IG_SKIP_WORDS = {"home", "studio", "de", "del", "la", "el", "en", "con", "para", "y", "a", "the", "and", "midi", "midiplus"}


def _query_to_hashtags(query: str) -> list[str]:
    if query.strip().startswith("#"):
        tags = [t.strip().lstrip("#") for t in query.split() if t.startswith("#")]
        if tags:
            return tags

    words = [w.lower().strip("#") for w in query.split()]
    tags: list[str] = []
    for w in words:
        if w in _IG_KEYWORD_MAP:
            tag = _IG_KEYWORD_MAP[w]
            if tag not in tags:
                tags.append(tag)
    for tag in _IG_DEFAULT_HASHTAGS:
        if tag not in tags:
            tags.append(tag)
        if len(tags) >= 5:
            break
    return tags


def _instagram_poll_urls(client: CDPClient, posts_limit: int, timeout: int = 18) -> list[str]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        result = evaluate(client, f"""
        (() => {{
          const loginWall = !!(
            document.querySelector('input[name="username"]') ||
            document.querySelector('[data-testid="login-username"]') ||
            (document.title || '').toLowerCase().includes('log in') ||
            location.href.includes('/accounts/login')
          );
          const postLinks = Array.from(document.querySelectorAll('a[href]'))
            .map(a => a.href.split('?')[0])
            .filter(h => /\\/p\\/|\\/reel\\//.test(h))
            .filter((v, i, arr) => arr.indexOf(v) === i);
          return {{loginWall, urls: postLinks.slice(0, {int(posts_limit)}), pageUrl: location.href, anchors: document.querySelectorAll('a').length}};
        }})()
        """) or {}
        urls = result.get("urls") or []
        print(f"[instagram] {result.get('pageUrl','?')!r:.80} anchors={result.get('anchors',0)} postLinks={len(urls)} loginWall={result.get('loginWall')}")
        if result.get("loginWall"):
            print("[instagram] Login wall detectado. Logueate en instagram.com en el perfil NSTBrowser correspondiente.")
            return []
        if urls:
            return urls
        time.sleep(2)
    print("[instagram] Timeout esperando posts.")
    return []


def _instagram_extract_comments(client: CDPClient, post_url: str, caption: str, max_comments: int) -> list[dict]:
    for scroll_y in (500, 900, 1300):
        evaluate(client, f"window.scrollTo(0, {scroll_y})")
        time.sleep(1.5)

    return evaluate(client, f"""
    (() => {{
      const out = [];
      const seen = new Set();
      const postUrl = {json.dumps(post_url)};
      const caption = {json.dumps(caption[:120])};

      const listItems = Array.from(document.querySelectorAll('ul li, div[role="list"] > div'));
      for (const li of listItems) {{
        if (out.length >= {int(max_comments)}) break;
        if (li.querySelector('h1, h2')) continue;

        const spans = Array.from(li.querySelectorAll('span[dir="auto"], span[class*="x193iq5w"]'));
        let text = spans.map(s => (s.innerText || '').replace(/\\s+/g, ' ').trim())
                       .filter(t => t.length > 3 && !/^\\d+$/.test(t))
                       .join(' ').trim();
        if (!text) text = (li.innerText || '').split('\\n')[0].replace(/\\s+/g, ' ').trim();
        if (!text || text.length < 8) continue;
        if (/^(me gusta|like|responder|reply|ver|seguir|\\d+[smhdw]$)/i.test(text)) continue;

        const authorEl = li.querySelector('a[href*="/"]');
        const author = (authorEl?.innerText?.trim() ||
                        authorEl?.href?.split('/').filter(Boolean).pop() || '').replace(/\\s+/g,'').trim();

        const key = (author || 'anon') + '::' + text.slice(0, 50);
        if (seen.has(key)) continue;
        seen.add(key);

        const timeEl = li.querySelector('time[datetime]');
        out.push({{
          url: postUrl + '#comment-' + out.length,
          context: text.slice(0, 1600),
          author,
          publishedTime: timeEl?.getAttribute('datetime') || '',
          sourceType: 'instagram_comment',
          title: caption,
          videoUrl: postUrl,
          videoTitle: caption,
        }});
      }}
      return out;
    }})()
    """) or []


def extract_instagram_post_items(client: CDPClient, query: str, max_items: int, posts_limit: int = 10) -> list[dict]:
    hashtags = _query_to_hashtags(query)
    post_urls: list[str] = []
    seen_urls: set[str] = set()

    for tag in hashtags:
        if len(post_urls) >= posts_limit:
            break
        url = f"https://www.instagram.com/explore/tags/{tag}/"
        print(f"[instagram] Probando hashtag #{tag} -> {url}")
        client.send("Page.navigate", {"url": url})
        time.sleep(3)
        evaluate(client, "window.scrollBy(0, 600)")
        time.sleep(1)
        evaluate(client, "window.scrollBy(0, 600)")
        new_urls = _instagram_poll_urls(client, posts_limit, timeout=15)
        if new_urls:
            for u in new_urls:
                if u not in seen_urls:
                    seen_urls.add(u)
                    post_urls.append(u)
            print(f"[instagram] #{tag}: {len(new_urls)} posts, total acumulado: {len(post_urls)}")
        else:
            print(f"[instagram] #{tag}: sin posts (login wall o vacío)")

    items: list[dict] = []
    seen_items: set[str] = set()
    comments_per_post = max(3, max_items // max(1, len(post_urls)))

    for post_url in post_urls:
        if len(items) >= max_items:
            break
        print(f"[instagram] Navegando a post: {post_url}")
        client.send("Page.navigate", {"url": post_url})
        time.sleep(5)

        caption = ""
        author = ""
        actual_url = post_url
        deadline = time.time() + 15
        while time.time() < deadline:
            diag = evaluate(client, """
            (() => {
              const pageUrl = location.href;
              const loginWall = !!(
                document.querySelector('input[name="username"]') ||
                location.href.includes('/accounts/login')
              );
              const authorEl = document.querySelector(
                'header a[href][role="link"], header a[href], ' +
                'article a[href][role="link"]:not([href*="/p/"]):not([href*="/reel/"])'
              );
              const authorFromEl = authorEl?.innerText?.trim() ||
                             authorEl?.href?.split('/').filter(Boolean).pop() || '';
              const h2Link = document.querySelector('article h2 a, header h2 a, h1 a');
              const author = authorFromEl || h2Link?.innerText?.trim() || h2Link?.href?.split('/').filter(Boolean).pop() || '';
              const candidateSelectors = [
                'article h1', 'article span[dir="auto"]',
                'div[role="dialog"] span[dir="auto"]',
                'main span[dir="auto"]', 'span[dir="auto"]',
              ];
              let caption = '';
              for (const sel of candidateSelectors) {
                const els = Array.from(document.querySelectorAll(sel));
                const match = els.find(e => e.innerText.trim().length >= 20);
                if (match) { caption = match.innerText.replace(/\\s+/g, ' ').trim(); break; }
              }
              return {pageUrl, loginWall, author, caption, spans: document.querySelectorAll('span[dir="auto"]').length};
            })()
            """) or {}
            actual_url = diag.get("pageUrl", post_url).split("?")[0]
            print(f"[instagram] post url={actual_url!r:.70} spans={diag.get('spans',0)} caption={len(diag.get('caption',''))}chars loginWall={diag.get('loginWall')}")
            if diag.get("loginWall"):
                print("[instagram] Login wall en post. Saltando.")
                break
            if diag.get("caption", ""):
                caption = diag["caption"]
                author = diag.get("author", "")
                break
            time.sleep(2)

        if not caption:
            print(f"[instagram] Sin caption en {actual_url}, saltando.")
            continue

        cap_key = actual_url + "::" + caption[:60]
        if cap_key not in seen_items:
            seen_items.add(cap_key)
            items.append({
                "url": actual_url,
                "title": caption[:120],
                "author": author,
                "context": caption[:1600],
                "publishedTime": "",
                "sourceType": "instagram_post",
                "videoUrl": actual_url,
                "videoTitle": caption[:120],
            })

        comments = _instagram_extract_comments(client, actual_url, caption, comments_per_post)
        print(f"[instagram] {len(comments)} comentarios extraídos de {actual_url}")
        for c in comments:
            key = c.get("url", "") + c.get("context", "")[:30]
            if key not in seen_items and len(items) < max_items:
                seen_items.add(key)
                items.append(c)

    return items
