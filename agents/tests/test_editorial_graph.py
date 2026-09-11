"""Reglas del grafo editorial: pilar, relacionadas, entrantes y overrides."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from editorial_graph import (  # noqa: E402
    MAX_CROSS_CLUSTER,
    MAX_RELATED,
    MIN_INBOUND,
    Article,
    audit_article_links,
    plan_internal_links,
)


def guide(idx: int, cluster: str = "c1", **kwargs) -> Article:
    return Article(
        id=f"{cluster}-g{idx}",
        slug=f"{cluster}-guia-{idx}",
        content_type="GUIDE",
        cluster_id=cluster,
        title=f"Guía {idx}",
        published_at=f"2026-09-{idx:02d}",
        category_ids=kwargs.pop("category_ids", {"cat-" + cluster}),
        **kwargs,
    )


def pillar(cluster: str = "c1") -> Article:
    return Article(id=f"{cluster}-p", slug=f"{cluster}-pilar", content_type="PILLAR", cluster_id=cluster, title="Pilar", published_at="2026-09-01", category_ids={"cat-" + cluster})


def pairs(plan) -> list[tuple[str, str]]:
    return [(link.source_id, link.target_id) for link in plan]


def test_every_guide_links_its_pillar_first():
    articles = [pillar(), *(guide(i) for i in range(1, 6))]
    plan = plan_internal_links(articles)
    for article in articles[1:]:
        own = [link for link in plan if link.source_id == article.id]
        assert own[0].target_id == "c1-p"
        assert own[0].position == 0


def test_related_between_three_and_four_and_min_inbound():
    articles = [pillar(), *(guide(i) for i in range(1, 9))]
    plan = plan_internal_links(articles)
    assert audit_article_links(articles, pairs(plan)) == {}
    for article in articles[1:]:
        related = [link for link in plan if link.source_id == article.id and link.target_id != "c1-p"]
        assert 3 <= len(related) <= MAX_RELATED
        inbound = [link for link in plan if link.target_id == article.id and link.source_id != "c1-p"]
        assert len(inbound) >= MIN_INBOUND


def test_newest_guide_receives_inbound_from_older_pages():
    articles = [pillar(), *(guide(i) for i in range(1, 15))]
    newest = max(articles[1:], key=lambda item: item.published_at)
    plan = plan_internal_links(articles)
    sources = {link.source_id for link in plan if link.target_id == newest.id} - {"c1-p"}
    assert len(sources) >= MIN_INBOUND
    assert newest.id not in sources


def test_no_self_duplicate_or_unknown_links():
    articles = [pillar(), *(guide(i) for i in range(1, 7))]
    plan = plan_internal_links(articles)
    known = {article.id for article in articles}
    assert all(link.source_id != link.target_id for link in plan)
    assert len(pairs(plan)) == len(set(pairs(plan)))
    assert all(link.source_id in known and link.target_id in known for link in plan)


def test_at_most_one_cross_cluster_and_only_when_related():
    shared = {"cat-shared"}
    articles = [
        pillar("c1"), *(guide(i, "c1", category_ids=shared | {"cat-c1"}) for i in range(1, 4)),
        pillar("c2"), *(guide(i, "c2", category_ids=shared | {"cat-c2"}) for i in range(1, 4)),
        pillar("c3"), *(guide(i, "c3", category_ids={"cat-c3"}) for i in range(1, 4)),
    ]
    by_id = {article.id: article for article in articles}
    plan = plan_internal_links(articles)
    for article in articles:
        cross = [link for link in plan if link.source_id == article.id and by_id[link.target_id].cluster_id != article.cluster_id]
        assert len(cross) <= MAX_CROSS_CLUSTER
        # c3 no comparte catálogo con nadie: nunca enlaza fuera de su cluster.
        if article.cluster_id == "c3":
            assert cross == []


def test_pinned_and_excluded_survive_rebuild():
    articles = [pillar(), *(guide(i) for i in range(1, 8))]
    source, pinned_target, excluded_target = "c1-g1", "c1-g7", "c1-g2"
    plan = plan_internal_links(articles, pinned={source: [pinned_target]}, excluded={(source, excluded_target), (source, "c1-p")})
    planned = pairs(plan)
    assert (source, excluded_target) not in planned
    assert (source, "c1-p") not in planned  # el pilar también puede excluirse
    assert (source, pinned_target) not in planned  # ya existe como PINNED; no se duplica como AUTO
    related = [link for link in plan if link.source_id == source]
    assert len(related) + 1 <= MAX_RELATED  # el fijado ocupa capacidad
    assert all(link.position > 1 for link in related)  # posiciones después del fijado


def test_current_pillar_is_kept_over_newer_pillar():
    old = pillar()
    newer = Article(id="c1-p2", slug="c1-pilar-2", content_type="PILLAR", cluster_id="c1", published_at="2026-09-20")
    articles = [old, newer, guide(1), guide(2)]
    plan = plan_internal_links(articles, current_pillars={"c1": "c1-p"})
    pillar_links = [link for link in plan if link.source_id == "c1-g1" and link.position == 0]
    assert [link.target_id for link in pillar_links] == ["c1-p"]


def test_pillar_links_every_guide_of_its_cluster_only():
    articles = [pillar("c1"), *(guide(i, "c1") for i in range(1, 12)), pillar("c2"), guide(1, "c2")]
    plan = plan_internal_links(articles)
    from_pillar = {link.target_id for link in plan if link.source_id == "c1-p"}
    assert from_pillar == {f"c1-g{i}" for i in range(1, 12)}


def test_small_cluster_does_not_report_false_positives():
    articles = [pillar(), guide(1), guide(2)]
    plan = plan_internal_links(articles)
    assert audit_article_links(articles, pairs(plan)) == {}
