from pathlib import Path

import markdown
from fastapi import FastAPI, Form, Query, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from authority_swarm import db
from authority_swarm.config import ROOT

app = FastAPI(title="Authority Swarm Dashboard")

templates_dir = Path(__file__).parent / "templates"
templates = Jinja2Templates(directory=str(templates_dir))

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

md = markdown.Markdown(extensions=["tables", "fenced_code"])

STATUS_COLORS = {
    "draft": "bg-gray-100 text-gray-800",
    "reviewed": "bg-blue-100 text-blue-800",
    "approved": "bg-green-100 text-green-800",
    "published": "bg-purple-100 text-purple-800",
    "rejected": "bg-red-100 text-red-800",
}

STATUS_DOTS = {
    "draft": "bg-gray-400",
    "reviewed": "bg-blue-500",
    "approved": "bg-green-500",
    "published": "bg-purple-500",
    "rejected": "bg-red-500",
}

RISK_COLORS = {
    "low": "text-green-600",
    "medium": "text-yellow-600",
    "high": "text-red-600",
}


def _fmt_date(ds: str) -> str:
    if not ds:
        return ""
    return ds.replace("T", " ")[:16]


templates.env.filters["status_color"] = lambda s: STATUS_COLORS.get(s, "bg-gray-100")
templates.env.filters["status_dot"] = lambda s: STATUS_DOTS.get(s, "bg-gray-400")
templates.env.filters["risk_color"] = lambda s: RISK_COLORS.get(s, "text-gray-600")
templates.env.filters["fmt_date"] = _fmt_date


@app.get("/", response_class=HTMLResponse)
def dashboard(request: Request):
    conn = db.connect()
    try:
        total_landings = conn.execute("SELECT COUNT(*) as c FROM landing_pages").fetchone()["c"]
        status_counts = {}
        for row in conn.execute("SELECT status, COUNT(*) as c FROM landing_pages GROUP BY status"):
            status_counts[row["status"]] = row["c"]
        
        recent_landings = conn.execute(
            "SELECT * FROM landing_pages ORDER BY id DESC LIMIT 5"
        ).fetchall()
        
        total_research = conn.execute("SELECT COUNT(*) as c FROM landing_research").fetchone()["c"]
        total_reviews = conn.execute("SELECT COUNT(*) as c FROM landing_reviews").fetchone()["c"]
        
        recent_reviews = conn.execute(
            """
            SELECT r.*, l.title as landing_title, l.slug 
            FROM landing_reviews r
            JOIN landing_pages l ON l.id = r.landing_id
            ORDER BY r.id DESC LIMIT 5
            """
        ).fetchall()
    finally:
        conn.close()
    
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "total_landings": total_landings,
        "status_counts": status_counts,
        "recent_landings": recent_landings,
        "total_research": total_research,
        "total_reviews": total_reviews,
        "recent_reviews": recent_reviews,
    })


@app.get("/landings", response_class=HTMLResponse)
def landings(
    request: Request,
    status: str = Query("all"),
    q: str = Query(""),
    limit: int = Query(50),
):
    conn = db.connect()
    try:
        if status == "all":
            rows = conn.execute(
                "SELECT * FROM landing_pages ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM landing_pages WHERE status = ? ORDER BY id DESC LIMIT ?",
                (status, limit),
            ).fetchall()
    finally:
        conn.close()
    
    if q:
        q_lower = q.lower()
        rows = [r for r in rows if q_lower in r["title"].lower() or q_lower in r["topic"].lower()]
    
    return templates.TemplateResponse("landings.html", {
        "request": request,
        "landings": rows,
        "status": status,
        "q": q,
    })


@app.get("/landings/{landing_id}", response_class=HTMLResponse)
def landing_detail(request: Request, landing_id: int):
    conn = db.connect()
    try:
        landing = conn.execute(
            "SELECT * FROM landing_pages WHERE id = ?", (landing_id,)
        ).fetchone()
        
        if not landing:
            return HTMLResponse("Landing not found", status_code=404)
        
        reviews = conn.execute(
            "SELECT * FROM landing_reviews WHERE landing_id = ? ORDER BY id DESC",
            (landing_id,),
        ).fetchall()
        
        research = conn.execute(
            "SELECT * FROM landing_research WHERE topic = ? ORDER BY id DESC LIMIT 20",
            (landing["topic"],),
        ).fetchall()
    finally:
        conn.close()
    
    html_content = md.convert(landing["markdown"])
    md.reset()
    
    return templates.TemplateResponse("landing_detail.html", {
        "request": request,
        "landing": landing,
        "reviews": reviews,
        "research": research,
        "html_content": html_content,
    })


@app.post("/landings/{landing_id}/status")
def update_status(landing_id: int, status: str = Form(...)):
    db.update_landing_status(landing_id, status)
    return HTMLResponse(
        f'<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium {STATUS_COLORS.get(status, "bg-gray-100")}">'
        f'<span class="w-1.5 h-1.5 rounded-full {STATUS_DOTS.get(status, "bg-gray-400")}"></span>'
        f'{status.title()}</span>'
    )


@app.get("/research", response_class=HTMLResponse)
def research_list(
    request: Request,
    topic: str = Query(""),
    limit: int = Query(50),
):
    conn = db.connect()
    try:
        if topic:
            rows = conn.execute(
                "SELECT * FROM landing_research WHERE topic = ? ORDER BY id DESC LIMIT ?",
                (topic, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM landing_research ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        
        topics = [r["topic"] for r in conn.execute(
            "SELECT DISTINCT topic FROM landing_research ORDER BY topic"
        ).fetchall()]
    finally:
        conn.close()
    
    return templates.TemplateResponse("research.html", {
        "request": request,
        "research": rows,
        "topics": topics,
        "selected_topic": topic,
    })


@app.get("/preview/{landing_id}", response_class=HTMLResponse)
def preview_landing(landing_id: int):
    conn = db.connect()
    try:
        landing = conn.execute(
            "SELECT * FROM landing_pages WHERE id = ?", (landing_id,)
        ).fetchone()
    finally:
        conn.close()
    
    if not landing:
        return HTMLResponse("Not found", status_code=404)
    
    html_content = md.convert(landing["markdown"])
    md.reset()
    
    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>{landing['title']}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>body {{ font-family: 'Inter', sans-serif; }}</style>
    </head>
    <body class="bg-white">
        <div class="max-w-4xl mx-auto px-6 py-12">
            {html_content}
        </div>
    </body>
    </html>
    """)


@app.get("/api/stats")
def api_stats():
    conn = db.connect()
    try:
        total = conn.execute("SELECT COUNT(*) as c FROM landing_pages").fetchone()["c"]
        by_status = {}
        for row in conn.execute("SELECT status, COUNT(*) as c FROM landing_pages GROUP BY status"):
            by_status[row["status"]] = row["c"]
        research = conn.execute("SELECT COUNT(*) as c FROM landing_research").fetchone()["c"]
        reviews = conn.execute("SELECT COUNT(*) as c FROM landing_reviews").fetchone()["c"]
    finally:
        conn.close()
    
    return {"total_landings": total, "by_status": by_status, "total_research": research, "total_reviews": reviews}
