import time

from _cdp import CDPClient, evaluate
from extractors.generic import search_url_for

_LINKEDIN_DEFAULT_QUERIES = [
    "controlador MIDI produccion",
    "home studio setup midi",
    "bateria electronica",
    "MidiPlus kressmer",
    "interfaz audio home studio",
    "drum pad productor",
]


def extract_linkedin_items(client: CDPClient, query: str, max_items: int) -> list[dict]:
    client.send("Page.navigate", {"url": search_url_for("linkedin", query)})
    time.sleep(6)
    evaluate(client, "window.scrollBy(0, 400)")
    time.sleep(2)

    items: list[dict] = []
    seen: set[str] = set()
    deadline = time.time() + 30

    while time.time() < deadline and len(items) < max_items:
        result = evaluate(client, f"""
        (() => {{
          const loginWall = !!(
            document.querySelector('input[autocomplete="username"]') ||
            location.href.includes('/login') ||
            location.href.includes('/authwall')
          );
          const posts = Array.from(document.querySelectorAll(
            '.feed-shared-update-v2, [data-urn*="activity"], .search-results__cluster-content article, .occludable-update'
          ));
          const out = [];
          const seen = new Set();
          for (const post of posts) {{
            if (out.length >= {int(max_items)}) break;
            const linkEl = post.querySelector('a[href*="/posts/"], a[href*="/feed/update/"]');
            const url = linkEl?.href?.split('?')[0] || '';
            if (!url || seen.has(url)) continue;
            seen.add(url);
            const textEl = post.querySelector(
              '.feed-shared-update-v2__description-wrapper, .attributed-text-segment-list__content, ' +
              '[data-e="body-text"], .break-words, span[dir="ltr"]'
            );
            const text = ((textEl || post).innerText || '').replace(/\\s+/g, ' ').trim();
            if (text.length < 20) continue;
            const authorEl = post.querySelector(
              '.feed-shared-actor__name, .update-components-actor__name, ' +
              'span.hoverable-link-text, .app-aware-link[href*="/in/"]'
            );
            const author = (authorEl?.innerText || '').trim();
            out.push({{
              url,
              title: text.slice(0, 120),
              author,
              context: text.slice(0, 1600),
              publishedTime: '',
              sourceType: 'linkedin_post',
              videoUrl: url,
              videoTitle: text.slice(0, 120),
            }});
          }}
          return {{loginWall, items: out, pageUrl: location.href, postCount: posts.length}};
        }})()
        """) or {}

        print(f"[linkedin] url={result.get('pageUrl','?')!r:.70} posts={result.get('postCount',0)} loginWall={result.get('loginWall')}")

        if result.get("loginWall"):
            print("[linkedin] Login wall detectado. Logueate en LinkedIn en el perfil NSTBrowser correspondiente.")
            break

        for item in result.get("items") or []:
            key = item.get("url", "")
            if not key or key in seen:
                continue
            seen.add(key)
            items.append(item)
            if len(items) >= max_items:
                break

        if not result.get("items") and result.get("postCount", 0) == 0:
            break

        if len(items) < max_items:
            evaluate(client, "window.scrollBy(0, 900)")
            time.sleep(2)
        else:
            break

    return items
