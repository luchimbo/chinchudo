from datetime import datetime

from authority_swarm.config import ROOT
from authority_swarm.db import insert_landing_page, insert_landing_research, insert_landing_review, list_landing_pages, update_landing_status
from authority_swarm.landing.generator import generate_landing_page
from authority_swarm.landing.research import research_landing_topic
from authority_swarm.landing.reviewer import review_landing
from authority_swarm.landing.topics import LANDING_RESEARCH_TOPICS


ALLOWED_LANDING_STATUSES = {"draft", "reviewed", "approved", "published", "rejected"}


def run_landing_cycle(topics: list[str] | None = None, topic_limit: int = 2, research_limit: int = 6, review: bool = True) -> str:
    active_topics = topics or LANDING_RESEARCH_TOPICS[:topic_limit]
    landing_ids: list[int] = []
    lines = ["# Landing Page Cycle", "", f"Temas investigados: {len(active_topics)}", ""]

    for topic in active_topics:
        evidence = research_landing_topic(topic, limit=research_limit)
        for item in evidence:
            insert_landing_research(item)
        page = generate_landing_page(topic, evidence)
        landing_id = insert_landing_page(page)
        landing_ids.append(landing_id)

        landing_path = ROOT / "outputs" / "landing_pages" / f"{landing_id}-{page.slug}.md"
        landing_path.parent.mkdir(parents=True, exist_ok=True)
        landing_path.write_text(page.markdown, encoding="utf-8")

        review_summary = "No revisada"
        if review:
            landing_review = review_landing(landing_id, page.markdown)
            insert_landing_review(landing_review)
            if landing_review.verdict == "approve":
                update_landing_status(landing_id, "reviewed")
            elif landing_review.verdict == "reject":
                update_landing_status(landing_id, "rejected")
            review_summary = f"{landing_review.verdict} ({landing_review.risk_level})"

        lines.extend([
            f"## {topic}",
            "",
            f"- Landing ID: {landing_id}",
            f"- Evidencias: {len(evidence)}",
            f"- Archivo: {landing_path}",
            f"- Revision: {review_summary}",
            "",
        ])

    report_path = ROOT / "outputs" / "landing_reports" / f"{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines), encoding="utf-8")
    return str(report_path)


def list_landings(status: str = "draft", limit: int = 20) -> str:
    rows = list_landing_pages(status=status, limit=limit)
    lines = ["# Landing pages", "", f"Estado: {status}", f"Cantidad: {len(rows)}", ""]
    for row in rows:
        lines.extend([
            f"## {row['id']}. {row['title']}",
            "",
            f"- Topic: {row['topic']}",
            f"- Slug: {row['slug']}",
            f"- CTA: {row['cta_url']}",
            f"- Estado: {row['status']}",
            "",
        ])
    path = ROOT / "outputs" / "landing_reports" / f"{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-status-{status}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    return str(path)


def mark_landing_status(landing_id: int, status: str) -> bool:
    if status not in ALLOWED_LANDING_STATUSES:
        raise ValueError(f"Estado invalido: {status}. Usar uno de: {', '.join(sorted(ALLOWED_LANDING_STATUSES))}")
    return update_landing_status(landing_id, status)
