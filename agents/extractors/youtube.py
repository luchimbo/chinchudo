import time

from _cdp import CDPClient, evaluate
from extractors.generic import extract_visible_items, search_url_for


def extract_youtube_comment_items(client: CDPClient, query: str, max_items: int, videos_limit: int = 8) -> list[dict]:
    client.send("Page.navigate", {"url": search_url_for("youtube", query)})
    time.sleep(5)
    videos = extract_visible_items(client, "youtube", videos_limit)
    comments: list[dict] = []
    seen = set()

    for video in videos:
        if len(comments) >= max_items:
            break
        video_url = video.get("url", "")
        if not video_url:
            continue
        client.send("Page.navigate", {"url": video_url})
        time.sleep(4)
        evaluate(client, "window.scrollTo(0, Math.max(900, document.documentElement.scrollHeight * 0.35))")
        time.sleep(3)
        evaluate(client, "window.scrollTo(0, Math.max(1400, document.documentElement.scrollHeight * 0.55))")
        time.sleep(3)
        expression = f"""
        (async () => {{
          const maxItems = {int(max_items - len(comments))};
          const videoTitle = (document.querySelector('h1 yt-formatted-string, h1')?.innerText || document.title || '').replace(/\\s+/g, ' ').trim();
          const out = [];
          const nodes = Array.from(document.querySelectorAll('ytd-comment-thread-renderer'));
          for (const node of nodes) {{
            const author = (node.querySelector('#author-text, #author-text span, a#author-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const text = (node.querySelector('#content-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const time = (node.querySelector('.published-time-text, #published-time-text')?.innerText || '').replace(/\\s+/g, ' ').trim();
            const commentId = node.getAttribute('comment-id') || node.querySelector('a[href*="lc="]')?.href?.match(/[?&]lc=([^&]+)/)?.[1] || '';
            if (!text || text.length < 12) continue;
            out.push({{
              url: location.href.split('#')[0] + (commentId ? '#comment-' + commentId : '#comment-' + out.length),
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
          if (out.length) return out;

          const comments = document.querySelector('ytd-comments#comments, ytd-comments');
          const token = comments?.data?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
          const apiKey = window.ytcfg?.get('INNERTUBE_API_KEY');
          const context = window.ytcfg?.get('INNERTUBE_CONTEXT');
          if (!token || !apiKey || !context) return out;

          const response = await fetch('/youtubei/v1/next?key=' + apiKey, {{
            method: 'POST',
            headers: {{'content-type': 'application/json'}},
            body: JSON.stringify({{context, continuation: token}})
          }});
          const data = await response.json();
          const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
          for (const mutation of mutations) {{
            const payload = mutation?.payload?.commentEntityPayload;
            const props = payload?.properties;
            if (!props?.content?.content || !props.commentId) continue;
            const author = payload?.author || {{}};
            if (author.isCreator) continue;
            const content = props.content.content.replace(/\\s+/g, ' ').trim();
            if (content.length < 12) continue;
            const urlCount = (content.match(/https?:\\/\\//g) || []).length;
            if (urlCount > 1) continue;
            out.push({{
              url: location.href.split('#')[0] + '&lc=' + encodeURIComponent(props.commentId),
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
