import time
from urllib.parse import parse_qs, urlparse

from _cdp import CDPClient, evaluate
from extractors.generic import extract_visible_items, search_url_for


def unique_videos(items: list[dict]) -> list[dict]:
    """Chapter links (&t=30s) repeat the same result card; keep one entry per video id."""
    out, seen = [], set()
    for item in items:
        query = parse_qs(urlparse(item.get("url", "")).query)
        video = (query.get("v") or [""])[0]
        if not video or video in seen:
            continue
        seen.add(video)
        out.append({**item, "url": f"https://www.youtube.com/watch?v={video}"})
    return out


# A hidden/occluded window may never render result cards; ytInitialData has them on load.
_SEARCH_DATA_VIDEOS = """
(() => {
  const sections = window.ytInitialData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
  return sections.flatMap(s => s?.itemSectionRenderer?.contents || []).map(item => item?.videoRenderer).filter(v => v?.videoId).map(v => {
    const title = (v.title?.runs || []).map(r => r.text).join('');
    const snippet = (v.detailedMetadataSnippets?.[0]?.snippetText?.runs || []).map(r => r.text).join('');
    return {url: 'https://www.youtube.com/watch?v=' + v.videoId, title, context: (title + ' ' + snippet).trim(), author: v.ownerText?.runs?.[0]?.text || ''};
  });
})()
"""


def search_data_videos(client: CDPClient) -> list[dict]:
    try:
        return evaluate(client, _SEARCH_DATA_VIDEOS) or []
    except Exception:  # the DOM fallback below still runs
        return []


def wait_for_search_videos(client: CDPClient, wanted: int, timeout: float = 15.0, poll: float = 1.0) -> list[dict]:
    """Results often render ~9s after navigation; a fixed short sleep read zero videos."""
    deadline = time.monotonic() + timeout
    videos: list[dict] = []
    while True:
        time.sleep(poll)
        videos = unique_videos(search_data_videos(client) or extract_visible_items(client, "youtube", wanted * 4))
        if len(videos) >= wanted or time.monotonic() >= deadline:
            return videos[:wanted]


# YouTube search filters (sp). Popular videos of any age get new comments every day,
# and the newest-first comment pages surface the last 30 days. YouTube no longer
# combines "sort by views" with an upload-date filter (it returns no results), and
# "this month" alone brings uploads with a handful of views and no comments.
SEARCH_FILTERS = {
    "popular": "CAMSAhAB",  # videos, sort by view count
    "any": "",  # relevance
    "recent_month": "EgQIBBAB",  # this month, videos, relevance
}


def extract_youtube_comment_items(client: CDPClient, query: str, max_items: int, videos_limit: int = 2, video_offset: int = 0, search_mode: str = "any", comment_pages: int = 1) -> list[dict]:
    search_filter = SEARCH_FILTERS.get(search_mode, "")
    url = search_url_for("youtube", query) + (f"&sp={search_filter}" if search_filter else "")
    client.send("Page.navigate", {"url": url})
    video_offset = max(0, min(18, video_offset))
    videos = wait_for_search_videos(client, videos_limit + video_offset)[video_offset:]
    # One busy video must not use up the whole read: spread it across the videos.
    per_video = max(10, -(-max_items // max(1, len(videos))))
    comments: list[dict] = []
    seen = set()

    for video in videos:
        if len(comments) >= max_items:
            break
        video_url = video.get("url", "")
        if not video_url:
            continue
        client.send("Page.navigate", {"url": video_url})
        time.sleep(3)
        evaluate(client, "window.scrollTo(0, Math.max(900, document.documentElement.scrollHeight * 0.35))")
        time.sleep(1)
        evaluate(client, "window.scrollTo(0, Math.max(1400, document.documentElement.scrollHeight * 0.55))")
        time.sleep(1)
        evaluate(client, "document.querySelector('ytd-comments #sort-menu yt-sort-filter-sub-menu-renderer, ytd-comments yt-sort-filter-sub-menu-renderer')?.click()")
        time.sleep(0.5)
        evaluate(client, "Array.from(document.querySelectorAll('tp-yt-paper-listbox a, tp-yt-paper-listbox tp-yt-paper-item')).find(n => /newest|recientes|neueste/i.test(n.innerText || ''))?.click()")
        time.sleep(1)
        expression = f"""
        (async () => {{
          const maxItems = {int(min(per_video, max_items - len(comments)))};
          const maxPages = {int(max(1, comment_pages))};
          const ids = new Set();
          const videoTitle = (document.querySelector('h1 yt-formatted-string, h1')?.innerText || document.title || '').replace(/\\s+/g, ' ').trim();
          const out = [];
          const nodes = Array.from(document.querySelectorAll('ytd-comment-thread-renderer'));
          for (const node of nodes) {{
            const author = (node.querySelector('#author-text, #author-text span, a#author-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const text = (node.querySelector('#content-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const time = (node.querySelector('.published-time-text, #published-time-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const commentId = node.getAttribute('comment-id') || node.querySelector('a[href*="lc="]')?.href?.match(/[?&]lc=([^&]+)/)?.[1] || '';
            if (!text || text.length < 12) continue;
            if (commentId) ids.add(commentId);
            out.push({{
              url: commentId ? 'https://www.youtube.com/watch?v=' + new URL(location.href).searchParams.get('v') + '&lc=' + encodeURIComponent(commentId) : location.href.split('#')[0],
              title: videoTitle,
              author,
              context: text,
              publishedTime: time,
              sourceType: 'youtube_comment',
              videoUrl: location.href.split('#')[0],
              videoTitle,
              commentId
            }});
            if (out.length >= maxItems) break;
          }}
          if (out.length >= maxItems) return out;

          // A hidden/occluded window never renders ytd-comments; ytInitialData still has the token.
          const comments = document.querySelector('ytd-comments#comments, ytd-comments');
          const sections = window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents || [];
          const commentSection = sections.find(s => s?.itemSectionRenderer?.sectionIdentifier === 'comment-item-section')?.itemSectionRenderer;
          let token = comments?.data?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token
            || commentSection?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
          const apiKey = window.ytcfg?.get('INNERTUBE_API_KEY');
          const context = window.ytcfg?.get('INNERTUBE_CONTEXT');
          if (!token || !apiKey || !context) return out;

          const next = async (continuation) => (await fetch('/youtubei/v1/next?key=' + apiKey, {{
            method: 'POST',
            headers: {{'content-type': 'application/json'}},
            body: JSON.stringify({{context, continuation}})
          }})).json();
          const continuationItems = (data) => (data?.onResponseReceivedEndpoints || [])
            .flatMap(e => e?.reloadContinuationItemsCommand?.continuationItems || e?.appendContinuationItemsAction?.continuationItems || []);
          let data = await next(token);
          // Default order is "top comments"; the 30-day window needs the newest ones.
          const header = continuationItems(data).find(item => item?.commentsHeaderRenderer)?.commentsHeaderRenderer;
          const sortItems = header?.sortMenu?.sortFilterSubMenuRenderer?.subMenuItems || [];
          const newest = sortItems.find(item => /newest|reciente|neueste/i.test(item?.title || '')) || sortItems[1];
          const newestToken = newest?.serviceEndpoint?.continuationCommand?.token;
          if (newestToken) data = await next(newestToken);
          for (let page = 0; page < maxPages && data && out.length < maxItems; page += 1) {{
           if (page > 0) data = await next(token);
           const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
           // The last continuation item of a page points to the next (older) page.
           token = continuationItems(data).map(item => item?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token).filter(Boolean).at(-1);
           for (const mutation of mutations) {{
            const payload = mutation?.payload?.commentEntityPayload;
            const props = payload?.properties;
            if (!props?.content?.content || !props.commentId || ids.has(props.commentId)) continue;
            const author = payload?.author || {{}};
            if (author.isCreator) continue;
            const content = props.content.content.replace(/\\s+/g, ' ').trim();
            if (content.length < 12) continue;
            const urlCount = (content.match(/https?:\\/\\//g) || []).length;
            if (urlCount > 1) continue;
            ids.add(props.commentId);
            out.push({{
              url: 'https://www.youtube.com/watch?v=' + new URL(location.href).searchParams.get('v') + '&lc=' + encodeURIComponent(props.commentId),
              title: videoTitle,
              author: author.displayName || props.authorButtonA11y || '',
              context: content,
              publishedTime: props.publishedTime || '',
              sourceType: 'youtube_comment',
              videoUrl: location.href.split('#')[0],
              videoTitle,
              commentId: props.commentId
            }});
            if (out.length >= maxItems) break;
           }}
           if (!token) break;
          }}
          return out;
        }})()
        """
        for item in evaluate(client, expression, await_promise=True) or []:
            key = item.get("url") or f"{item.get('videoUrl')}::{item.get('author')}::{item.get('context')}"
            if key in seen:
                continue
            seen.add(key)
            comments.append(item)
            if len(comments) >= max_items:
                break

    if comments:
        return comments
    return videos[:max_items]
