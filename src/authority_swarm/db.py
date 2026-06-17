import sqlite3
from pathlib import Path

from authority_swarm.config import ROOT
from authority_swarm.models import AuditResult, ContentPlan, DistributionOpportunity, Draft, DraftReview, LandingPage, LandingResearchItem, LandingReview, Opportunity, OpportunityCuration


DB_PATH = ROOT / "data" / "app.db"


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                content TEXT NOT NULL,
                UNIQUE(path, chunk_index)
            );

            CREATE TABLE IF NOT EXISTS opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                url TEXT,
                platform TEXT,
                community TEXT,
                author TEXT,
                result_type TEXT,
                geo_scope TEXT,
                title TEXT NOT NULL,
                original_text TEXT,
                question_or_problem TEXT NOT NULL,
                intent TEXT NOT NULL,
                priority INTEGER NOT NULL,
                rationale TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS drafts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                opportunity_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                content_type TEXT NOT NULL,
                markdown TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                question TEXT NOT NULL,
                model TEXT NOT NULL,
                answer TEXT NOT NULL,
                mentions_brands TEXT NOT NULL,
                mentions_person INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS draft_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                draft_id INTEGER NOT NULL,
                verdict TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                issues TEXT NOT NULL,
                recommendations TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS opportunity_curations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                opportunity_id INTEGER NOT NULL,
                decision TEXT NOT NULL,
                score INTEGER NOT NULL,
                reason TEXT NOT NULL,
                suggested_angle TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS content_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                markdown TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS distribution_opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT NOT NULL,
                url TEXT,
                platform TEXT,
                target_type TEXT,
                brand TEXT,
                topic TEXT,
                action_type TEXT,
                priority INTEGER NOT NULL,
                authority_score INTEGER NOT NULL,
                risk_level TEXT NOT NULL,
                pitch TEXT NOT NULL,
                rationale TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS landing_research (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                source TEXT,
                url TEXT,
                platform TEXT,
                title TEXT,
                snippet TEXT,
                need TEXT,
                intent TEXT,
                geo_scope TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS landing_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                topic TEXT NOT NULL,
                title TEXT NOT NULL,
                slug TEXT NOT NULL,
                markdown TEXT NOT NULL,
                cta_url TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS landing_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                landing_id INTEGER NOT NULL,
                verdict TEXT NOT NULL,
                risk_level TEXT NOT NULL,
                issues TEXT NOT NULL,
                recommendations TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        _ensure_columns(conn, "opportunities", {
            "platform": "TEXT",
            "community": "TEXT",
            "author": "TEXT",
            "result_type": "TEXT",
            "geo_scope": "TEXT",
            "original_text": "TEXT",
        })
        _ensure_columns(conn, "audits", {
            "mentions_competitors": "TEXT DEFAULT ''",
            "gaps": "TEXT DEFAULT ''",
        })
        _ensure_columns(conn, "drafts", {
            "status": "TEXT DEFAULT 'draft'",
        })
        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_url ON opportunities(url) WHERE url IS NOT NULL AND url != ''")
        except sqlite3.IntegrityError:
            pass
    finally:
        conn.close()


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name, definition in columns.items():
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {definition}")


def replace_documents(chunks: list[tuple[Path, int, str]]) -> None:
    conn = connect()
    try:
        conn.execute("DELETE FROM documents")
        conn.executemany(
            "INSERT INTO documents(path, chunk_index, content) VALUES (?, ?, ?)",
            [(str(path), index, content) for path, index, content in chunks],
        )
        conn.commit()
    finally:
        conn.close()


def insert_opportunity(opportunity: Opportunity) -> int:
    conn = connect()
    try:
        if opportunity.url:
            existing = conn.execute("SELECT id FROM opportunities WHERE url = ?", (opportunity.url,)).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE opportunities
                    SET source = ?, platform = ?, community = ?, author = ?, result_type = ?, geo_scope = ?, title = ?,
                        original_text = ?, question_or_problem = ?, intent = ?, priority = ?, rationale = ?
                    WHERE id = ?
                    """,
                    (
                        opportunity.source,
                        opportunity.platform,
                        opportunity.community,
                        opportunity.author,
                        opportunity.result_type,
                        opportunity.geo_scope,
                        opportunity.title,
                        opportunity.original_text,
                        opportunity.question_or_problem,
                        opportunity.intent.value,
                        opportunity.priority,
                        opportunity.rationale,
                        int(existing["id"]),
                    ),
                )
                conn.commit()
                return int(existing["id"])
        cur = conn.execute(
            """
            INSERT INTO opportunities(source, url, platform, community, author, result_type, geo_scope, title, original_text, question_or_problem, intent, priority, rationale, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                opportunity.source,
                opportunity.url,
                opportunity.platform,
                opportunity.community,
                opportunity.author,
                opportunity.result_type,
                opportunity.geo_scope,
                opportunity.title,
                opportunity.original_text,
                opportunity.question_or_problem,
                opportunity.intent.value,
                opportunity.priority,
                opportunity.rationale,
                opportunity.created_at.isoformat(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_opportunities_by_ids(ids: list[int]) -> list[sqlite3.Row]:
    if not ids:
        return []
    conn = connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        return conn.execute(
            f"SELECT * FROM opportunities WHERE id IN ({placeholders}) ORDER BY CASE WHEN result_type = 'conversation_or_question' THEN 0 ELSE 1 END, priority ASC, id DESC",
            ids,
        ).fetchall()
    finally:
        conn.close()


def list_drafts_by_opportunity_ids(ids: list[int]) -> list[sqlite3.Row]:
    if not ids:
        return []
    conn = connect()
    try:
        placeholders = ",".join("?" for _ in ids)
        return conn.execute(
            f"SELECT * FROM drafts WHERE opportunity_id IN ({placeholders}) ORDER BY id DESC",
            ids,
        ).fetchall()
    finally:
        conn.close()


def list_opportunities_without_drafts(limit: int = 10) -> list[sqlite3.Row]:
    return list_opportunities_missing_draft_type("seo_article", limit=limit)


def list_opportunities_missing_draft_type(content_type: str, limit: int = 10, latest: bool = False) -> list[sqlite3.Row]:
    source_rank = "CASE WHEN o.platform = 'reddit' THEN 0 WHEN o.result_type = 'conversation_or_question' THEN 1 ELSE 2 END"
    order_by = "o.id DESC" if latest else f"{source_rank}, o.priority ASC, o.id DESC"
    conn = connect()
    try:
        return conn.execute(
            f"""
            SELECT o.* FROM opportunities o
            LEFT JOIN drafts d ON d.opportunity_id = o.id AND d.content_type = ?
            WHERE d.id IS NULL
            ORDER BY {order_by}
            LIMIT ?
            """,
            (content_type, limit),
        ).fetchall()
    finally:
        conn.close()


def draft_exists(opportunity_id: int, content_type: str) -> bool:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id FROM drafts WHERE opportunity_id = ? AND content_type = ? LIMIT 1",
            (opportunity_id, content_type),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def insert_draft(draft: Draft) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO drafts(opportunity_id, title, content_type, markdown, created_at, status) VALUES (?, ?, ?, ?, ?, ?)",
            (draft.opportunity_id, draft.title, draft.content_type, draft.markdown, draft.created_at.isoformat(), "draft"),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_drafts_by_status(status: str = "draft", limit: int = 20) -> list[sqlite3.Row]:
    conn = connect()
    try:
        if status == "all":
            return conn.execute(
                "SELECT * FROM drafts ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM drafts WHERE status = ? ORDER BY id DESC LIMIT ?",
            (status, limit),
        ).fetchall()
    finally:
        conn.close()


def update_draft_status(draft_id: int, status: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("UPDATE drafts SET status = ? WHERE id = ?", (status, draft_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_recent_drafts(limit: int = 10, only_unreviewed: bool = True) -> list[sqlite3.Row]:
    conn = connect()
    try:
        if only_unreviewed:
            return conn.execute(
                """
                SELECT d.*, o.platform, o.community, o.geo_scope, o.original_text
                FROM drafts d
                JOIN opportunities o ON o.id = d.opportunity_id
                LEFT JOIN draft_reviews r ON r.draft_id = d.id
                WHERE r.id IS NULL
                ORDER BY d.id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return conn.execute(
            """
            SELECT d.*, o.platform, o.community, o.geo_scope, o.original_text
            FROM drafts d
            JOIN opportunities o ON o.id = d.opportunity_id
            ORDER BY d.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()


def insert_draft_review(review: DraftReview) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            """
            INSERT INTO draft_reviews(draft_id, verdict, risk_level, issues, recommendations, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                review.draft_id,
                review.verdict,
                review.risk_level,
                "\n".join(review.issues),
                "\n".join(review.recommendations),
                review.created_at.isoformat(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_recent_opportunities_for_curation(limit: int = 20, only_uncurated: bool = True) -> list[sqlite3.Row]:
    conn = connect()
    try:
        if only_uncurated:
            return conn.execute(
                """
                SELECT o.* FROM opportunities o
                LEFT JOIN opportunity_curations c ON c.opportunity_id = o.id
                WHERE c.id IS NULL
                ORDER BY o.id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return conn.execute("SELECT * FROM opportunities ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    finally:
        conn.close()


def insert_opportunity_curation(curation: OpportunityCuration) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            """
            INSERT INTO opportunity_curations(opportunity_id, decision, score, reason, suggested_angle, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                curation.opportunity_id,
                curation.decision,
                curation.score,
                curation.reason,
                curation.suggested_angle,
                curation.created_at.isoformat(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_curated_opportunities_for_generation(limit: int = 10) -> list[sqlite3.Row]:
    conn = connect()
    try:
        return conn.execute(
            """
            SELECT o.* FROM opportunities o
            JOIN opportunity_curations c ON c.opportunity_id = o.id
            LEFT JOIN drafts d ON d.opportunity_id = o.id AND d.content_type = 'seo_article'
            WHERE d.id IS NULL AND c.decision = 'generate'
            ORDER BY c.score DESC, o.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()


def list_planning_inputs(limit: int = 15) -> list[sqlite3.Row]:
    conn = connect()
    try:
        return conn.execute(
            """
            SELECT o.id, o.title, o.platform, o.community, o.geo_scope, o.result_type,
                   o.question_or_problem, o.original_text, c.decision, c.score,
                   c.reason, c.suggested_angle,
                   GROUP_CONCAT(d.content_type || ': ' || d.title, ' | ') AS draft_summary
            FROM opportunities o
            JOIN opportunity_curations c ON c.opportunity_id = o.id
            LEFT JOIN drafts d ON d.opportunity_id = o.id
            WHERE c.decision IN ('generate', 'monitor')
            GROUP BY o.id
            ORDER BY c.score DESC, o.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()


def insert_content_plan(plan: ContentPlan, markdown: str) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO content_plans(title, summary, markdown, created_at) VALUES (?, ?, ?, ?)",
            (plan.title, plan.summary, markdown, plan.created_at.isoformat()),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def insert_distribution_opportunity(opportunity: DistributionOpportunity) -> int:
    conn = connect()
    try:
        if opportunity.url:
            existing = conn.execute(
                "SELECT id FROM distribution_opportunities WHERE url = ? AND brand = ? AND topic = ?",
                (opportunity.url, opportunity.brand, opportunity.topic),
            ).fetchone()
            if existing:
                conn.execute(
                    """
                    UPDATE distribution_opportunities
                    SET source = ?, platform = ?, target_type = ?, action_type = ?, priority = ?, authority_score = ?,
                        risk_level = ?, pitch = ?, rationale = ?, status = ?
                    WHERE id = ?
                    """,
                    (
                        opportunity.source,
                        opportunity.platform,
                        opportunity.target_type,
                        opportunity.action_type,
                        opportunity.priority,
                        opportunity.authority_score,
                        opportunity.risk_level,
                        opportunity.pitch,
                        opportunity.rationale,
                        opportunity.status,
                        int(existing["id"]),
                    ),
                )
                conn.commit()
                return int(existing["id"])
        cur = conn.execute(
            """
            INSERT INTO distribution_opportunities(source, url, platform, target_type, brand, topic, action_type, priority, authority_score, risk_level, pitch, rationale, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                opportunity.source,
                opportunity.url,
                opportunity.platform,
                opportunity.target_type,
                opportunity.brand,
                opportunity.topic,
                opportunity.action_type,
                opportunity.priority,
                opportunity.authority_score,
                opportunity.risk_level,
                opportunity.pitch,
                opportunity.rationale,
                opportunity.status,
                opportunity.created_at.isoformat(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_distribution_opportunities(status: str = "new", limit: int = 20) -> list[sqlite3.Row]:
    conn = connect()
    try:
        if status == "all":
            return conn.execute(
                """
                SELECT * FROM distribution_opportunities
                ORDER BY priority ASC, authority_score DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return conn.execute(
            """
            SELECT * FROM distribution_opportunities
            WHERE status = ?
            ORDER BY priority ASC, authority_score DESC, id DESC
            LIMIT ?
            """,
            (status, limit),
        ).fetchall()
    finally:
        conn.close()


def update_distribution_status(distribution_id: int, status: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("UPDATE distribution_opportunities SET status = ? WHERE id = ?", (status, distribution_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def list_drafts_needing_revision(limit: int = 10) -> list[sqlite3.Row]:
    conn = connect()
    try:
        return conn.execute(
            """
            SELECT d.*, o.platform, o.community, o.geo_scope, o.original_text,
                   r.verdict, r.risk_level, r.issues, r.recommendations
            FROM drafts d
            JOIN opportunities o ON o.id = d.opportunity_id
            JOIN draft_reviews r ON r.draft_id = d.id
            LEFT JOIN drafts revised ON revised.opportunity_id = d.opportunity_id
                AND revised.content_type = d.content_type || '_revised'
            WHERE r.verdict IN ('revise', 'reject')
              AND revised.id IS NULL
            ORDER BY r.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()


def insert_audit(audit: AuditResult) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO audits(question, model, answer, mentions_brands, mentions_person, mentions_competitors, gaps, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                audit.question,
                audit.model,
                audit.answer,
                ",".join(audit.mentions_brands),
                int(audit.mentions_person),
                ",".join(audit.mentions_competitors),
                "\n".join(audit.gaps),
                audit.created_at.isoformat(),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_recent_audit_gaps(limit: int = 20) -> list[sqlite3.Row]:
    conn = connect()
    try:
        return conn.execute(
            """
            SELECT * FROM audits
            WHERE gaps IS NOT NULL AND gaps != ''
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()


def insert_landing_research(item: LandingResearchItem) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            """
            INSERT INTO landing_research(topic, source, url, platform, title, snippet, need, intent, geo_scope, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (item.topic, item.source, item.url, item.platform, item.title, item.snippet, item.need, item.intent, item.geo_scope, item.created_at.isoformat()),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def insert_landing_page(page: LandingPage) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            "INSERT INTO landing_pages(topic, title, slug, markdown, cta_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (page.topic, page.title, page.slug, page.markdown, page.cta_url, page.status, page.created_at.isoformat()),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def insert_landing_review(review: LandingReview) -> int:
    conn = connect()
    try:
        cur = conn.execute(
            """
            INSERT INTO landing_reviews(landing_id, verdict, risk_level, issues, recommendations, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (review.landing_id, review.verdict, review.risk_level, "\n".join(review.issues), "\n".join(review.recommendations), review.created_at.isoformat()),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_landing_pages(status: str = "draft", limit: int = 20) -> list[sqlite3.Row]:
    conn = connect()
    try:
        if status == "all":
            return conn.execute("SELECT * FROM landing_pages ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return conn.execute("SELECT * FROM landing_pages WHERE status = ? ORDER BY id DESC LIMIT ?", (status, limit)).fetchall()
    finally:
        conn.close()


def update_landing_status(landing_id: int, status: str) -> bool:
    conn = connect()
    try:
        cur = conn.execute("UPDATE landing_pages SET status = ? WHERE id = ?", (status, landing_id))
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
