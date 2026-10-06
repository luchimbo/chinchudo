"""Read-only checks of configured searches; emits one evidence record per source.

No opportunities are imported and no browser/social account is used. A JSON
snapshot is supplied by the Prisma runner; stdout is a JSONL protocol.
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from _config import load_env

load_env()
import listening_connectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("snapshot")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    sources = json.loads(Path(args.snapshot).read_text(encoding="utf-8"))
    for source in sources:
        started = datetime.now(timezone.utc).isoformat()
        try:
            items, health = listening_connectors.discover_searxng(source["channel"], source["query"], source["limit"])
        except Exception as exc:
            items, health = [], {"provider": "searxng", "status": "unavailable", "error": str(exc)}
        record = {
            "id": source["id"], "channel": source["channel"], "query": source["query"],
            "startedAt": started, "checkedAt": datetime.now(timezone.utc).isoformat(),
            "health": health, "itemsRead": len(items),
            "sampleUrls": [item["url"] for item in items[:3]],
        }
        print(json.dumps(record, ensure_ascii=False), flush=True)
        # Espaciado también cuando hay respuesta vacía; no insistir en CAPTCHA.
        time.sleep(3)


if __name__ == "__main__":
    main()
