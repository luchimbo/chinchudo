import time

from _cdp import CDPClient, evaluate
from extractors.generic import search_url_for

_X_DEFAULT_QUERIES = [
    "controlador MIDI",
    "teclado MIDI comprar",
    "home studio midi",
    "produccion musical midi",
    "interfaz de audio",
    "drum pad comprar",
    "ableton midi controller",
    "fl studio midi",
    "home recording setup",
    "estudio en casa midi",
    "beatmaker midi",
    "sintetizador midi",
]


def _x_queries_from(query: str) -> list[str]:
    if "|" in query:
        parts = [q.strip() for q in query.split("|") if q.strip()]
        if parts:
            return parts
    if query.strip():
        return [query.strip()] + [q for q in _X_DEFAULT_QUERIES if q.lower() not in query.lower()]
    return _X_DEFAULT_QUERIES


def _x_fetch_tweets(client: CDPClient, query: str, max_items: int) -> list[dict]:
    client.send("Page.navigate", {"url": search_url_for("x", query)})
    time.sleep(5)
    evaluate(client, "window.scrollBy(0, 400)")

    items: list[dict] = []
    seen: set[str] = set()
    deadline = time.time() + 20

    while time.time() < deadline and len(items) < max_items:
        result = evaluate(client, f"""
        (() => {{
          const loginWall = !!(
            document.querySelector('input[autocomplete="username"]') ||
            location.href.includes('/i/flow/login') ||
            location.href.includes('/login')
          );
          const tweets = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
          const out = [];
          for (const tweet of tweets) {{
            if (out.length >= {int(max_items)}) break;
            const textEl = tweet.querySelector('[data-testid="tweetText"]');
            const text = textEl?.innerText?.replace(/\\s+/g, ' ').trim() || '';
            if (!text || text.length < 15) continue;
            const userNameEl = tweet.querySelector('[data-testid="User-Name"] a');
            const author = userNameEl?.innerText?.trim() || '';
            const timeEl = tweet.querySelector('time');
            const tweetLink = timeEl?.closest('a');
            const url = tweetLink?.href || '';
            if (!url) continue;
            const publishedTime = timeEl?.getAttribute('datetime') || '';
            out.push({{
              url,
              title: text.slice(0, 120),
              author,
              context: text.slice(0, 1600),
              publishedTime,
              sourceType: 'x_post',
              videoUrl: url,
              videoTitle: text.slice(0, 120),
            }});
          }}
          return {{loginWall, items: out, pageUrl: location.href, tweetCount: tweets.length}};
        }})()
        """) or {}

        page_url = result.get("pageUrl", "")
        print(f"[x] url={page_url!r:.70} tweets={result.get('tweetCount',0)} loginWall={result.get('loginWall')}")

        if result.get("loginWall"):
            print("[x] Login wall detectado.")
            break

        if page_url and "x.com" not in page_url:
            print(f"[x] Redirigido fuera de X ({page_url[:60]}), sin resultados para esta query.")
            break

        for item in result.get("items") or []:
            key = item.get("url", "")
            if not key or key in seen:
                continue
            seen.add(key)
            items.append(item)
            if len(items) >= max_items:
                break

        tweet_count = result.get("tweetCount", 0)
        if tweet_count == 0:
            time.sleep(2)
            continue

        prev_len = len(items)
        if len(items) < max_items:
            evaluate(client, "window.scrollBy(0, 800)")
            time.sleep(2)
            after = evaluate(client, "document.querySelectorAll('article[data-testid=\"tweet\"]').length") or 0
            if after <= tweet_count and len(items) == prev_len:
                break
        else:
            break

    return items


def extract_x_post_items(client: CDPClient, query: str, max_items: int) -> list[dict]:
    queries = _x_queries_from(query)
    items: list[dict] = []
    seen: set[str] = set()

    for q in queries:
        if len(items) >= max_items:
            break
        print(f"[x] Probando query: {q!r}")
        remaining = max_items - len(items)
        batch = _x_fetch_tweets(client, q, remaining)
        for item in batch:
            key = item.get("url", "")
            if not key or key in seen:
                continue
            seen.add(key)
            items.append(item)
            if len(items) >= max_items:
                break
        print(f"[x] Query {q!r}: {len(batch)} tweets, total acumulado: {len(items)}")

    return items
