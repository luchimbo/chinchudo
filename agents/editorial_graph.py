"""Planificación pura del grafo editorial del blog.

No toca la base: recibe artículos publicados e indexables de UN cliente y las
decisiones manuales (PINNED/EXCLUDED) y devuelve los enlaces AUTO a persistir.
Mantenerlo puro permite probar las reglas del grafo sin Postgres.

Reglas:
- Cada guía enlaza a su pilar (posición 0) salvo que esté excluido, y el pilar
  enlaza a todas las guías de su cluster (su índice temático, sin tope).
- Cada artículo muestra hasta MAX_RELATED guías relacionadas; como máximo
  MAX_CROSS_CLUSTER de un cluster distinto, y sólo si comparten catálogo.
- Primero se garantizan MIN_INBOUND enlaces entrantes desde guías del mismo
  cluster para cada guía (así una guía nueva recibe enlaces de páginas
  anteriores); después se completa la capacidad por relevancia.
- Nunca se crean autoenlaces, duplicados ni enlaces hacia pares excluidos.
"""

from __future__ import annotations

from dataclasses import dataclass, field

MAX_RELATED = 4
MIN_RELATED = 3
MAX_CROSS_CLUSTER = 1
MIN_INBOUND = 2


@dataclass
class Article:
    id: str
    slug: str
    content_type: str  # PILLAR | GUIDE
    cluster_id: str | None
    title: str = ""
    intent: str = ""
    published_at: str = ""
    category_ids: set[str] = field(default_factory=set)
    product_ids: set[str] = field(default_factory=set)

    @property
    def is_pillar(self) -> bool:
        return self.content_type == "PILLAR"


@dataclass(frozen=True)
class PlannedLink:
    source_id: str
    target_id: str
    anchor_text: str
    position: int


def relevance(source: Article, target: Article) -> int:
    """Relación temática; 0 significa que no hay motivo para enlazar."""
    score = 0
    same_cluster = bool(source.cluster_id) and source.cluster_id == target.cluster_id
    if same_cluster:
        score += 100
    shared_categories = len(source.category_ids & target.category_ids)
    shared_products = len(source.product_ids & target.product_ids)
    score += 30 * shared_categories + 20 * shared_products
    if not same_cluster and not (shared_categories or shared_products):
        return 0
    if source.intent and target.intent and source.intent != target.intent:
        score += 5  # intención complementaria
    return score


def pillar_by_cluster(articles: list[Article], current: dict[str, str] | None = None) -> dict[str, Article]:
    """Un pilar por cluster: se respeta el vigente; si no, gana el más nuevo."""
    by_id = {article.id: article for article in articles}
    result: dict[str, Article] = {}
    for cluster_id, pillar_id in (current or {}).items():
        pillar = by_id.get(pillar_id)
        if pillar and pillar.is_pillar and pillar.cluster_id == cluster_id:
            result[cluster_id] = pillar
    for article in sorted(articles, key=lambda item: item.published_at, reverse=True):
        if article.is_pillar and article.cluster_id and article.cluster_id not in result:
            result[article.cluster_id] = article
    return result


def plan_internal_links(
    articles: list[Article],
    pinned: dict[str, list[str]] | None = None,
    excluded: set[tuple[str, str]] | None = None,
    current_pillars: dict[str, str] | None = None,
) -> list[PlannedLink]:
    pinned = pinned or {}
    excluded = excluded or set()
    by_id = {article.id: article for article in articles}
    pillars = pillar_by_cluster(articles, current_pillars)
    pillar_ids = {pillar.id for pillar in pillars.values()}

    # Estado por origen: destinos ya ocupados (manuales o AUTO) y cuántos
    # vienen de otro cluster, para no romper los topes al completar.
    taken: dict[str, set[str]] = {article.id: set() for article in articles}
    related_count: dict[str, int] = {article.id: 0 for article in articles}
    cross_count: dict[str, int] = {article.id: 0 for article in articles}
    inbound: dict[str, int] = {article.id: 0 for article in articles}
    planned: dict[str, list[tuple[Article, bool]]] = {article.id: [] for article in articles}

    for source_id, targets in pinned.items():
        source = by_id.get(source_id)
        for target_id in targets:
            target = by_id.get(target_id)
            if not source or not target or target_id == source_id:
                continue
            taken[source_id].add(target_id)
            if source_id not in pillar_ids:
                inbound[target_id] += 1
            if target_id not in pillar_ids:
                related_count[source_id] += 1
                if source.cluster_id != target.cluster_id:
                    cross_count[source_id] += 1

    def can_add(source: Article, target: Article) -> bool:
        if source.id in pillar_ids:
            return False  # el pilar ya enlaza a todo su cluster
        if source.id == target.id or target.id in taken[source.id] or (source.id, target.id) in excluded:
            return False
        if target.id in pillar_ids:
            return False  # el pilar se agrega aparte, no ocupa capacidad
        if related_count[source.id] >= MAX_RELATED:
            return False
        if source.cluster_id != target.cluster_id and cross_count[source.id] >= MAX_CROSS_CLUSTER:
            return False
        return relevance(source, target) > 0

    def add(source: Article, target: Article, is_pillar_link: bool = False) -> None:
        taken[source.id].add(target.id)
        if source.id not in pillar_ids:
            inbound[target.id] += 1  # los entrantes mínimos son desde otras guías
        planned[source.id].append((target, is_pillar_link))
        if not is_pillar_link:
            related_count[source.id] += 1
            if source.cluster_id != target.cluster_id:
                cross_count[source.id] += 1

    # 1) Enlace contextual obligatorio de cada guía hacia su pilar.
    for article in articles:
        pillar = pillars.get(article.cluster_id or "")
        if pillar and pillar.id != article.id and pillar.id not in taken[article.id] and (article.id, pillar.id) not in excluded:
            add(article, pillar, is_pillar_link=True)
    for pillar in pillars.values():
        for article in sorted(articles, key=lambda item: (item.published_at, item.slug)):
            if article.cluster_id == pillar.cluster_id and article.id != pillar.id and article.id not in taken[pillar.id] and (pillar.id, article.id) not in excluded:
                add(pillar, article, is_pillar_link=True)

    # 2) Enlaces entrantes mínimos: las guías más nuevas primero, así la
    #    recién publicada recibe enlaces desde páginas anteriores.
    guides = [article for article in articles if not article.is_pillar]
    for target in sorted(guides, key=lambda item: (item.published_at, item.slug), reverse=True):
        sources = sorted(
            (source for source in guides if source.cluster_id == target.cluster_id and can_add(source, target)),
            key=lambda source: (related_count[source.id], -relevance(source, target), source.slug),
        )
        for source in sources:
            if inbound[target.id] >= MIN_INBOUND:
                break
            add(source, target)

    # 3) Completar hasta MAX_RELATED por relevancia.
    for source in sorted(articles, key=lambda item: item.slug):
        candidates = sorted(
            (target for target in articles if can_add(source, target)),
            key=lambda target: (-relevance(source, target), target.slug),
        )
        for target in candidates:
            if not can_add(source, target):
                continue
            add(source, target)

    links: list[PlannedLink] = []
    for source_id, targets in planned.items():
        manual_count = len(pinned.get(source_id, []))
        ordered = sorted(targets, key=lambda entry: not entry[1])  # estructurales primero
        structural = sum(1 for _, is_pillar_link in ordered if is_pillar_link)
        for offset, (target, is_pillar_link) in enumerate(ordered):
            if source_id in pillar_ids:
                position = manual_count + offset + 1
            else:
                position = 0 if is_pillar_link else manual_count + offset - structural + 1
            links.append(PlannedLink(source_id, target.id, (target.title or target.slug)[:180], position))
    return links


def audit_article_links(articles: list[Article], links: list[tuple[str, str]]) -> dict[str, list[str]]:
    """Resumen de reglas incumplidas por artículo, para reportes y tests."""
    pillars = pillar_by_cluster(articles)
    by_id = {article.id: article for article in articles}
    outbound: dict[str, set[str]] = {article.id: set() for article in articles}
    inbound: dict[str, set[str]] = {article.id: set() for article in articles}
    for source_id, target_id in links:
        if source_id in outbound and target_id in inbound:
            outbound[source_id].add(target_id)
            inbound[target_id].add(source_id)
    cluster_sizes: dict[str, int] = {}
    for article in articles:
        if not article.is_pillar and article.cluster_id:
            cluster_sizes[article.cluster_id] = cluster_sizes.get(article.cluster_id, 0) + 1

    issues: dict[str, list[str]] = {}
    for article in articles:
        problems: list[str] = []
        pillar = pillars.get(article.cluster_id or "")
        related = [by_id[target] for target in outbound[article.id] if not by_id[target].is_pillar]
        peers = cluster_sizes.get(article.cluster_id or "", 0) - (0 if article.is_pillar else 1)
        if not article.is_pillar:
            if pillar is None:
                problems.append("cluster_sin_pilar")
            elif pillar.id not in outbound[article.id]:
                problems.append("no_enlaza_pilar")
            if len(related) < min(MIN_RELATED, peers):
                problems.append("pocas_relacionadas")
            guide_inbound = [source for source in inbound[article.id] if not by_id[source].is_pillar]
            if len(guide_inbound) < min(MIN_INBOUND, peers):
                problems.append("pocos_entrantes")
        if article.is_pillar:
            pass  # el pilar funciona como índice de su cluster: sin tope
        elif len(related) > MAX_RELATED:
            problems.append("demasiadas_relacionadas")
        if not article.is_pillar and sum(1 for target in related if target.cluster_id != article.cluster_id) > MAX_CROSS_CLUSTER:
            problems.append("demasiados_enlaces_de_otro_cluster")
        if problems:
            issues[article.id] = problems
    return issues
