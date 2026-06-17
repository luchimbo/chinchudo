import httpx


SUBREDDITS = [
    "argentina",
    "BuenosAires",
    "WeAreTheMusicMakers",
    "musicproduction",
    "audioengineering",
    "synthesizers",
    "edmproduction",
    "ableton",
]


def search_reddit(query: str, limit: int = 10) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    headers = {"User-Agent": "authority-swarm/0.1 local research bot"}
    per_subreddit = max(1, min(5, limit // max(1, len(SUBREDDITS)) + 1))

    with httpx.Client(headers=headers, timeout=30, follow_redirects=True) as client:
        for subreddit in SUBREDDITS:
            if len(results) >= limit:
                break
            url = f"https://www.reddit.com/r/{subreddit}/search.json"
            response = client.get(
                url,
                params={"q": query, "restrict_sr": "1", "sort": "new", "limit": per_subreddit},
            )
            if response.status_code != 200:
                continue
            for child in response.json().get("data", {}).get("children", []):
                data = child.get("data", {})
                permalink = data.get("permalink", "")
                results.append({
                    "source": f"reddit/r/{subreddit}",
                    "platform": "reddit",
                    "community": f"r/{subreddit}",
                    "author": f"u/{data.get('author', '')}" if data.get("author") else "",
                    "geo_scope": "argentina" if subreddit in {"argentina", "BuenosAires"} else "global_unknown",
                    "title": data.get("title", ""),
                    "url": f"https://www.reddit.com{permalink}" if permalink else "",
                    "snippet": (data.get("selftext") or "")[:500],
                    "original_text": data.get("selftext") or data.get("title", ""),
                    "result_type": "conversation_or_question",
                })
                if len(results) >= limit:
                    break
    return results
