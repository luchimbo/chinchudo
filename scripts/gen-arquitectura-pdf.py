"""Genera un PDF con la arquitectura actual de Los 5 Apóstoles / chinchudo."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, ListFlowable, ListItem
)

OUT = "reports/arquitectura-chinchudo.pdf"

# Paleta (alineada con el diagrama)
BLUE = colors.HexColor("#185FA5")
TEAL = colors.HexColor("#0F6E56")
PURPLE = colors.HexColor("#534AB7")
CORAL = colors.HexColor("#993C1D")
AMBER = colors.HexColor("#854F0B")
GRAY = colors.HexColor("#5F5E5A")
INK = colors.HexColor("#2C2C2A")
LIGHT = colors.HexColor("#F1EFE8")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("H1b", parent=styles["Title"], fontSize=22, textColor=INK, spaceAfter=2))
styles.add(ParagraphStyle("Sub", parent=styles["Normal"], fontSize=11, textColor=GRAY, spaceAfter=14))
styles.add(ParagraphStyle("H2b", parent=styles["Heading1"], fontSize=15, textColor=INK, spaceBefore=14, spaceAfter=6))
styles.add(ParagraphStyle("H3b", parent=styles["Heading2"], fontSize=12.5, textColor=INK, spaceBefore=10, spaceAfter=4))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10.3, leading=15, textColor=INK, alignment=TA_LEFT, spaceAfter=6))
styles.add(ParagraphStyle("Cap", parent=styles["Normal"], fontSize=9, textColor=GRAY, spaceAfter=8))
styles.add(ParagraphStyle("Step", parent=styles["Normal"], fontSize=10.3, leading=15, textColor=INK))
styles.add(ParagraphStyle("BoxT", parent=styles["Normal"], fontSize=10, leading=13, textColor=colors.white))

story = []

def layer(title, subtitle, boxes, color):
    """boxes: list of (titulo, contenido)"""
    story.append(Paragraph(title, styles["H3b"]))
    if subtitle:
        story.append(Paragraph(subtitle, styles["Cap"]))
    cells = []
    for bt, bc in boxes:
        cells.append(Paragraph(f"<b>{bt}</b><br/>{bc}", styles["BoxT"]))
    # repartir en filas de hasta 3 columnas
    rows = [cells[i:i+3] for i in range(0, len(cells), 3)]
    for r in rows:
        while len(r) < 3 and len(rows) > 1:
            r.append(Paragraph("", styles["BoxT"]))
    t = Table(rows, colWidths=[57*mm]*len(rows[0]))
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), color),
        ("BOX", (0,0), (-1,-1), 0.5, colors.white),
        ("INNERGRID", (0,0), (-1,-1), 3, colors.white),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 7),
        ("RIGHTPADDING", (0,0), (-1,-1), 7),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 4))

def arrow(text):
    story.append(Paragraph(f'<para align="center"><font color="#888780">▼ &nbsp; {text}</font></para>', styles["Cap"]))

# ---------- Portada / título ----------
story.append(Paragraph("Los 5 Apóstoles", styles["H1b"]))
story.append(Paragraph("Arquitectura actual del sistema · repo: chinchudo · PC MIDI Center", styles["Sub"]))
story.append(HRFlowable(width="100%", thickness=1, color=LIGHT, spaceAfter=10))

story.append(Paragraph(
    "Dashboard interno de inteligencia comercial, social listening y respuestas asistidas por IA. "
    "El sistema combina un dashboard web en la nube con agentes que corren en una PC local y "
    "controlan navegadores reales. Todo se sincroniza a través de una única base de datos en Supabase.",
    styles["Body"]))

# ---------- Diagrama por capas ----------
story.append(Paragraph("Las 4 capas del sistema", styles["H2b"]))

layer("1 · Vercel — dashboard web (Next.js 14)",
      "Producción · login por contraseña (AUTH_SECRET) · 14 páginas server-rendered · server actions",
      [("Operación social", "/ · /opportunities · /personas · /brands · /products · /knowledge · /prompts · /monitoring"),
       ("Crecimiento SEO", "/landings · /leads · /distribution · /geo · /analytics · /informe · /logins"),
       ("API routes", "/api/leads · /events · /click · /nurture · /unsubscribe · /stats · /analytics")],
      BLUE)
arrow("Prisma ORM")

layer("2 · Supabase Postgres — fuente única de verdad",
      "Pooled (app + agentes) · Direct (migraciones) · 20+ tablas",
      [("Social", "Opportunity · Response · PublishingLog · MonitoredSource · Channel"),
       ("Conocimiento", "Brand · Product · Persona · KnowledgeBase · Objection · PromptVersion"),
       ("SEO / Leads", "Landing · LeadMagnet · Lead · NurtureStep · DistributionPiece · GeoAudit · TrackingEvent"),
       ("Sistema", "AppSetting (incluye AGENT_RELAY_URL) · SystemLog")],
      TEAL)
arrow("el relay escribe la URL del túnel en AppSetting")

layer("3 · Tu PC (Windows) — agentes locales",
      "Semi-automático · cloudflared expone el relay → Vercel le manda pedidos de publicación (fire-and-forget, 202)",
      [("agent-relay.mjs (3099) + cloudflared", "/publish · /login-status · /accounts · /debug · /health — auth Bearer token"),
       ("orchestrator.py", "listen · monitor · daily · draft · export · healthcheck → corre social-listen.py por cada fuente activa"),
       ("swarm.py", "research · generate · build-landings · nurture · distribution · geo-audit · conversion"),
       ("NSTBrowser / Dolphin (CDP)", "5 perfiles = 5 personas · auto-asignación de cuenta por canal · máx 3 browsers · extractors: youtube/reddit/facebook/instagram/x/tiktok/linkedin")],
      PURPLE)
arrow("servicios externos")

layer("4 · Servicios externos",
      "",
      [("OpenRouter", "DeepSeek / Gemini — 3 variantes de borrador (SHORT · TECHNICAL · CONVERSATIONAL) y resúmenes"),
       ("SMTP nurturing", "secuencia de emails a leads + tracking de apertura / click"),
       ("Serper / DuckDuckGo", "investigación de keywords y competidores para landings + GEO")],
      GRAY)

# ---------- Pipeline A ----------
story.append(Paragraph("Pipeline A — Social listening + respuestas asistidas", styles["H2b"]))
story.append(Paragraph("El corazón del sistema. Dos pipelines independientes comparten la misma base de datos.", styles["Cap"]))

pasos_a = [
    "<b>Detección.</b> En /monitoring se cargan fuentes (MonitoredSource: canal + query + cuenta + límite). El orchestrator.py monitor las lee, auto-asigna qué perfil/persona usa cada canal (criterio: que la cuenta tenga el canal permitido y sea la menos usada recientemente) y limita a 3 navegadores simultáneos por vuelta; el resto queda diferido.",
    "<b>Extracción.</b> social-listen.py se conecta vía CDP (WebSocket crudo, sin Selenium) a un navegador real de NSTBrowser/Dolphin y corre el extractor del canal. Sobre cada ítem aplica filtros: on-topic (keywords de dominio MIDI/audio + exclusiones tipo 'midi skirt'), idioma (español vs inglés), antigüedad (descarta comentarios viejos) y 'accionable' (descarta emojis/tags/elogios cortos sin pregunta). Lo que pasa va a data/social-listen-intake.jsonl.",
    "<b>Importación.</b> import-opportunities.mjs lee el JSONL, re-clasifica intención/prioridad, detecta marca, deduplica y crea Opportunity con estado NEW.",
    "<b>Generación IA.</b> 'Generar respuestas' arma un prompt con persona + marca + producto del catálogo + KnowledgeBase + Objection + prompt activo, llama a OpenRouter y guarda 3 variantes. Hay rate-limit, reintentos con backoff y fallback a generador local si la IA falla. Reglas duras: nunca nombrar la tienda, hablar como usuario real, siempre mencionar un producto, nunca cerrar con pregunta.",
    "<b>Aprobación.</b> Fede edita la mejor variante y la aprueba (estado APPROVED).",
    "<b>Publicación.</b> Vercel no puede abrir navegadores, así que publishViaAgent hace POST /publish al relay en la PC (su URL pública vive en AppSetting.AGENT_RELAY_URL, actualizada automáticamente por el túnel cloudflared). El relay responde 202 y procesa en background: publish-response.mjs chequea anti-spam (cap diario por cuenta + separación mínima entre comentarios), publisher.py publica con el navegador real, marca la oportunidad como PUBLISHED y auto-descarta las oportunidades hermanas del mismo post para no comentar dos veces en el mismo lugar.",
    "<b>Seguimiento.</b> PublishingLog registra URL, cuenta y resultado; las que necesitan respuesta quedan en FOLLOW_UP.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(p, styles["Step"]), value=i+1) for i, p in enumerate(pasos_a)],
    bulletType="1", leftIndent=14, bulletColor=CORAL, spaceBefore=2))

# ---------- Pipeline B ----------
story.append(Paragraph("Pipeline B — Crecimiento SEO / GEO (swarm.py)", styles["H2b"]))
story.append(Paragraph(
    "research (keywords) → generate (landings HTML con IA) → build-landings (deploy estático a blog.pcmidicenter.com) "
    "→ captura de Lead vía API → nurture (secuencia de emails SMTP con tracking) → distribution (piezas para redes) "
    "→ geo-audit (mide si las IAs recomiendan a PC MIDI) → conversion (analiza qué landings convierten). "
    "Todo persiste en Supabase y se visualiza en /landings, /leads, /geo y /analytics.",
    styles["Body"]))

# ---------- Lo que ata todo ----------
story.append(Paragraph("Lo que ata todo", styles["H2b"]))
ata = [
    "<b>Supabase es la única fuente de verdad</b> — tanto Vercel (Prisma/TS) como los agentes (Python y scripts Node) leen y escriben las mismas tablas.",
    "<b>El relay + cloudflared es el puente</b> que permite que un dashboard en la nube dispare acciones de navegador en tu máquina.",
    "<b>NSTBrowser da las 5 identidades</b> (una persona por perfil): Profe, Productor, Baterista, Kressmer y Cazador. Eso hace que las respuestas parezcan de usuarios reales distintos.",
    "Cada corrida deja un <b>reporte JSON</b> en reports/ y los errores de IA / rate-limit van a la tabla SystemLog.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(p, styles["Body"]), value="•") for p in ata],
    bulletType="bullet", leftIndent=14, bulletColor=TEAL))

# ---------- Notas ----------
story.append(Paragraph("Notas de revisión", styles["H2b"]))
notas = [
    "En el README el proyecto figura como 'Los 5 Apóstoles' / pcmidi-suite, pero se está subiendo al repo 'chinchudo'. Confirmar que es a propósito.",
    "agents/accounts.json y .env contienen credenciales reales y NO deberían terminar en GitHub. Conviene verificar que .gitignore los excluya antes de cualquier push.",
]
story.append(ListFlowable(
    [ListItem(Paragraph(p, styles["Body"]), value="•") for p in notas],
    bulletType="bullet", leftIndent=14, bulletColor=AMBER))

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=18*mm, rightMargin=18*mm,
                        topMargin=16*mm, bottomMargin=16*mm,
                        title="Arquitectura - Los 5 Apostoles")
doc.build(story)
print("OK:", OUT)
