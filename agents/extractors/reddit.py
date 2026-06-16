import time

from _cdp import CDPClient, evaluate
from extractors.generic import extract_visible_items, search_url_for


def extract_reddit_comment_items(client: CDPClient, query: str, max_items: int, threads_limit: int = 6) -> list[dict]:
    client.send("Page.navigate", {"url": search_url_for("reddit", query)})
    time.sleep(4)
    threads = extract_visible_items(client, "reddit", threads_limit)
    comments: list[dict] = []
    seen: set[str] = set()

    for thread in threads:
        if len(comments) >= max_items:
            break
        thread_url = thread.get("url", "")
        if not thread_url:
            continue
        old_url = (
            thread_url
            .replace("www.reddit.com", "old.reddit.com")
            .replace("://reddit.com/", "://old.reddit.com/")
        )
        if "old.reddit.com" not in old_url:
            old_url = old_url.replace("reddit.com/r/", "old.reddit.com/r/")
        client.send("Page.navigate", {"url": old_url})
        time.sleep(3)
        remaining = int(max_items - len(comments))
        expression = f"""
        (() => {{
          const maxItems = {remaining};
          const postTitle = (
            document.querySelector('.thing.link .title a, #siteTable .title a')?.innerText ||
            document.title || ''
          ).replace(/\\s+/g, ' ').trim();
          const postUrl = location.href.split('?')[0];
          const out = [];

          const selftext = document.querySelector('.thing.link .usertext-body .md');
          if (selftext) {{
            const text = selftext.innerText.replace(/\\s+/g, ' ').trim();
            if (text.length >= 20) {{
              const author = document.querySelector('.thing.link .tagline a.author')?.innerText || '';
              const ts = document.querySelector('.thing.link time')?.getAttribute('title') ||
                         document.querySelector('.thing.link .age time')?.getAttribute('datetime') || '';
              out.push({{
                url: postUrl,
                title: postTitle,
                author,
                context: text,
                publishedTime: ts,
                sourceType: 'reddit_post',
                videoUrl: postUrl,
                videoTitle: postTitle,
                commentId: '',
              }});
            }}
          }}

          const commentNodes = Array.from(document.querySelectorAll('.commentarea .comment'));
          for (const node of commentNodes) {{
            if (out.length >= maxItems) break;
            if (node.classList.contains('deleted') || node.classList.contains('spam')) continue;
            const textEl = node.querySelector('.usertext-body .md');
            const text = textEl ? textEl.innerText.replace(/\\s+/g, ' ').trim() : '';
            if (!text || text.length < 15) continue;
            const author = node.querySelector('a.author')?.innerText || '';
            const permalink = node.querySelector('a.bylink')?.href || '';
            const ts = node.querySelector('time')?.getAttribute('datetime') ||
                       node.querySelector('.live-timestamp')?.innerText || '';
            const commentId = node.getAttribute('data-fullname') || '';
            out.push({{
              url: permalink || (postUrl + '#' + commentId),
              title: postTitle,
              author,
              context: text,
              publishedTime: ts,
              sourceType: 'reddit_comment',
              videoUrl: postUrl,
              videoTitle: postTitle,
              commentId,
            }});
          }}
          return out;
        }})()
        """
        for item in evaluate(client, expression) or []:
            key = item.get("url") or f"{item.get('videoUrl')}::{item.get('author')}::{(item.get('context') or '')[:60]}"
            if key in seen:
                continue
            seen.add(key)
            comments.append(item)
            if len(comments) >= max_items:
                break

    return comments if comments else threads[:max_items]
