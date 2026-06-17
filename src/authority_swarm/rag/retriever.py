import re
import sqlite3
from collections import Counter

from authority_swarm.db import connect


STOPWORDS = {
    "para", "como", "con", "una", "que", "los", "las", "del", "por", "sus", "sobre",
    "the", "and", "for", "what", "how", "are", "you", "your",
}


def tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-zA-ZáéíóúñÁÉÍÓÚÑ0-9]{3,}", text.lower()) if token not in STOPWORDS]


def score(query_terms: Counter[str], content: str) -> int:
    content_terms = Counter(tokenize(content))
    return sum(content_terms[term] * weight for term, weight in query_terms.items())


def retrieve(query: str, limit: int = 6) -> list[sqlite3.Row]:
    terms = Counter(tokenize(query))
    if not terms:
        return []
    conn = connect()
    try:
        rows = conn.execute("SELECT path, chunk_index, content FROM documents").fetchall()
    finally:
        conn.close()
    ranked = sorted(((score(terms, row["content"]), row) for row in rows), key=lambda item: item[0], reverse=True)
    return [row for value, row in ranked[:limit] if value > 0]


def context_for(query: str, limit: int = 6) -> str:
    rows = retrieve(query, limit=limit)
    if not rows:
        return "No hay contexto documental cargado para esta consulta."
    parts = []
    for row in rows:
        parts.append(f"Fuente: {row['path']}#{row['chunk_index']}\n{row['content']}")
    return "\n\n---\n\n".join(parts)
