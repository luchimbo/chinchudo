"""Genera un informe PDF compacto a partir de una foto de marca en JSON."""
import json
import sys
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
out = Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8.5, leading=11))
doc = SimpleDocTemplate(str(out), pagesize=A4, rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=1.5*cm, bottomMargin=1.5*cm)
story = [Paragraph(f"Foto de marca - {payload['clientName']}", styles["Title"]), Paragraph(f"Hito {payload['milestone']} | Corte: {payload['capturedAt']} | Base: {payload['baselineAt']}", styles["Small"]), Spacer(1, 0.45*cm)]
for title, rows in payload["sections"].items():
    story.append(Paragraph(title, styles["Heading2"]))
    table = Table([["Metrica", "Valor", "Delta D0"]] + [[key, str(value), f"{payload['deltas'].get(section_key, {}).get(key, 0):+d}"] for section_key, key, value in rows], colWidths=[8.4*cm, 3.2*cm, 3.2*cm])
    table.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#25352e")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), 0.25, colors.HexColor("#cfd6d1")), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("FONTSIZE", (0,0), (-1,-1), 8), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f5f7f5")]), ("ALIGN", (1,1), (-1,-1), "RIGHT"), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5)]))
    story.extend([table, Spacer(1, 0.35*cm)])
story.append(Paragraph("Fuente: snapshot inmutable de datos internos de Los 5 Apostoles. No incluye metricas publicas.", styles["Small"]))
doc.build(story)
