import json

from _cdp import CDPClient, evaluate, js_string
from _config import SEARCH_URLS
from urllib.parse import quote


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
