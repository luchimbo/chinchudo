import json
import urllib.parse
import urllib.request

from _cdp import CDPClient, evaluate, js_string
from _config import SEARCH_URLS
from urllib.parse import quote


def _fetch_bing_indexed_items(hosts: tuple[str, ...], query: str, max_items: int) -> list[dict]:
    """Read public Bing result markup when the CDP search tab is unreliable.

    This does not authenticate to or interact with a social platform. It only
    obtains already-indexed public snippets; `social-listen.py` remains the
    single place that applies every acceptance rule.
    """
    try:
        from bs4 import BeautifulSoup
        site_filter = " OR ".join(f"site:{host}" for host in hosts)
        url = "https://www.bing.com/search?q=" + urllib.parse.quote(f"({site_filter}) {query}")
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; pcmidi-radar/1.0)"})
        with urllib.request.urlopen(request, timeout=15) as response:
            html = response.read().decode("utf-8", "replace")
        soup = BeautifulSoup(html, "html.parser")
        items: list[dict] = []
        for result in soup.select("li.b_algo"):
            anchor = result.select_one("h2 a[href]")
            if not anchor:
                continue
            href = anchor.get("href", "").strip()
            try:
                parsed = urllib.parse.urlparse(href)
            except ValueError:
                continue
            hostname = parsed.hostname or ""
            if not any(hostname == host or hostname.endswith("." + host) for host in hosts):
                continue
            snippet = result.select_one(".b_caption p")
            context = result.get_text(" ", strip=True)
            if snippet:
                context = snippet.get_text(" ", strip=True)
            if len(context) < 25:
                continue
            items.append({
                "url": href.split("#", 1)[0],
                "title": anchor.get_text(" ", strip=True)[:220],
                "context": context[:1600],
                "publishedTime": "",
                "sourceType": "indexed_public_result",
            })
            if len(items) >= max_items:
                break
        return items
    except Exception:
        return []


def search_url_for(channel: str, query: str) -> str:
    if channel not in SEARCH_URLS:
        raise ValueError(f"Canal no soportado para escucha: {channel}")
    return SEARCH_URLS[channel].format(query=quote(query))


def extract_visible_items(client: CDPClient, channel: str, max_items: int) -> list[dict]:
    expression = f"""
    (() => {{
      const channel = {js_string(channel)};
      const maxItems = {int(max_items)};
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const out = [];
      const seen = new Set();
      for (const a of anchors) {{
        const href = new URL(a.href, location.href).href;
        const box = a.closest('article, ytd-video-renderer, ytd-rich-item-renderer, [role="article"], div, li') || a;
        const title = (a.innerText || a.textContent || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
        const context = ((box.innerText || box.textContent || title) || '').replace(/\\s+/g, ' ').trim();
        if (!href || seen.has(href)) continue;
        if (channel === 'youtube' && !href.includes('/watch')) continue;
        if (channel === 'reddit' && !href.includes('/comments/')) continue;
        if (channel === 'x' && !/x\\.com\\/.+\\/status\\//.test(href)) continue;
        if (channel === 'instagram' && !/instagram\\.com\\/(p|reel)\\//.test(href)) continue;
        if (channel === 'facebook' && !href.includes('facebook.com')) continue;
        if (channel === 'tiktok' && !/tiktok\\.com\\/@[^/]+\\/video\\//.test(href)) continue;
        if (channel === 'linkedin' && !/linkedin\\.com\\/(posts|feed\\/update)\\//.test(href)) continue;
        if (context.length < 25) continue;
        seen.add(href);
        out.push({{url: href, title: title.slice(0, 220), context: context.slice(0, 1600)}});
        if (out.length >= maxItems) break;
      }}
      return out;
    }})()
    """
    return evaluate(client, expression) or []


_INDEXED_HOSTS = {
    "youtube": ("youtube.com",),
    "reddit": ("reddit.com",),
    "facebook": ("facebook.com",),
    "instagram": ("instagram.com",),
    "x": ("x.com", "twitter.com"),
    "tiktok": ("tiktok.com",),
    "linkedin": ("linkedin.com",),
}


def extract_public_indexed_items(channel: str, query: str, max_items: int) -> list[dict]:
    """Public, read-only indexed discovery that does not require a CDP tab."""
    hosts = _INDEXED_HOSTS.get(channel, ())
    return _fetch_bing_indexed_items(hosts, query, max_items) if hosts else []


def extract_indexed_social_items(client: CDPClient, channel: str, query: str, max_items: int) -> list[dict]:
    """CDP-only fallback for public, search-indexed social posts.

    Direct platform search often returns an empty shell to an authorised browser.
    Google result pages expose public post URLs and snippets without an API or
    any interaction with the social network. They are candidates only; the
    normal listener quality filters still decide whether to import them.
    """
    hosts = _INDEXED_HOSTS.get(channel, ())
    if not hosts:
        return []
    items = extract_public_indexed_items(channel, query, max_items)
    if len(items) >= max_items:
        return items
    site_filter = " OR ".join(f"site:{host}" for host in hosts)
    # Google sometimes serves a consent/challenge shell to CDP profiles. Bing
    # indexes the same public pages and has a stable, non-authenticated result
    # layout, so use both indexers. These are discovery sources only: the
    # caller still applies the unchanged client relevance, language, age and
    # actionability checks before a row can enter the intake.
    search_urls = [
        f"https://www.google.com/search?q={quote(f'({site_filter}) {query}')}",
        f"https://www.bing.com/search?q={quote(f'({site_filter}) {query}')}",
    ]
    allowed_hosts = json.dumps(list(hosts))
    expression = f"""
    (() => {{
      const allowed = {allowed_hosts};
      const out = [];
      const seen = new Set();
      const candidates = Array.from(document.querySelectorAll('a')).filter(anchor =>
        anchor.querySelector('h3, h2') || anchor.closest('li.b_algo, .MjjYud, [data-snhf]')
      );
      for (const anchor of candidates) {{
        if (out.length >= {int(max_items)}) break;
        let href = anchor.href || '';
        try {{
          const parsed = new URL(href, location.href);
          href = parsed.searchParams.get('q') || parsed.searchParams.get('url') || href;
        }} catch (_) {{ continue; }}
        let target;
        try {{ target = new URL(href); }} catch (_) {{ continue; }}
        if (!allowed.some(host => target.hostname === host || target.hostname.endsWith('.' + host))) continue;
        href = target.href.split('#')[0];
        if (seen.has(href)) continue;
        const heading = anchor.querySelector('h3, h2');
        const container = anchor.closest('li.b_algo, div.MjjYud, [data-snhf]') || anchor.parentElement;
        const context = (container?.innerText || anchor.parentElement?.parentElement?.innerText || heading?.innerText || anchor.innerText || '')
          .replace(/\\s+/g, ' ').trim();
        if (context.length < 25) continue;
        seen.add(href);
        const publishedMatch = context.match(/hace\\s+\\d+\\s+(?:año|años|year|years|mes|meses|month|months|semana|semanas|week|weeks)/i);
        out.push({{
          url: href,
          title: (heading?.innerText || anchor.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 220),
          context: context.slice(0, 1600),
          publishedTime: publishedMatch ? publishedMatch[0] : '',
          sourceType: '{channel}_indexed_result',
        }});
      }}
      return out;
    }})()
    """
    import time
    seen_urls: set[str] = {str(item.get("url", "")) for item in items}
    for url in search_urls:
        client.send("Page.navigate", {"url": url})
        time.sleep(3)
        for item in evaluate(client, expression) or []:
            item_url = item.get("url", "")
            if not item_url or item_url in seen_urls:
                continue
            seen_urls.add(item_url)
            items.append(item)
            if len(items) >= max_items:
                return items
    return items
