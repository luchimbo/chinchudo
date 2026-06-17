from pathlib import Path

from authority_swarm.config import ROOT
from authority_swarm.db import replace_documents


def chunk_text(text: str, max_chars: int = 1800) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if len(current) + len(paragraph) + 2 > max_chars and current:
            chunks.append(current.strip())
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}" if current else paragraph
    if current:
        chunks.append(current.strip())
    return chunks


def ingest_docs(docs_dir: Path | None = None) -> int:
    base = docs_dir or ROOT / "docs"
    chunks: list[tuple[Path, int, str]] = []
    for path in sorted(base.rglob("*.md")):
        text = path.read_text(encoding="utf-8")
        for index, chunk in enumerate(chunk_text(text)):
            chunks.append((path.relative_to(ROOT), index, chunk))
    replace_documents(chunks)
    return len(chunks)
