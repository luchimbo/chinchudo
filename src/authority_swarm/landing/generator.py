from authority_swarm.config import get_settings
from authority_swarm.llm import chat
from authority_swarm.models import LandingPage, LandingResearchItem
from authority_swarm.rag.retriever import context_for


CTA_URL = "https://www.pcmidi.com.ar/"

SYSTEM = """Sos un estratega de landing pages para PC MIDI Center.
Creas landing pages comerciales/educativas basadas en necesidades reales detectadas en internet.
No escribis posts de blog. Escribis paginas de aterrizaje con CTA claro hacia pcmidi.com.ar.
No inventes stock, precios, oficialidad, exclusividad, soporte tecnico oficial, reparaciones, alquileres, clases, grabacion, mezcla ni mastering.
"""


def slugify(text: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in text.lower()).strip("-")[:90]


def generate_landing_page(topic: str, evidence: list[LandingResearchItem]) -> LandingPage:
    settings = get_settings()
    evidence_text = "\n\n".join(
        f"Fuente: {item.platform} | {item.title}\nURL: {item.url}\nNecesidad: {item.need}\nTexto: {item.snippet}"
        for item in evidence
    )
    context = context_for(f"{topic}\nPCMidi\n{evidence_text[:2000]}")
    user = f"""Tema de landing: {topic}
Marca: {', '.join(settings.brand_list)}
CTA obligatorio: {CTA_URL}

Evidencia encontrada en internet:
{evidence_text[:7000]}

Contexto documental interno:
{context}

Genera una landing page en Markdown estructurado con estas secciones exactas. LA LANDING DEBE SER ESPECIFICA AL TEMA; no escribas contenido generico sobre "home studio" o "produccion musical" si el tema es un producto concreto como MicroFreak o MiniLab. Menciona el producto/categoria del tema en el H1, en la tabla y en las FAQs.

1. Hero
- H1 orientado a la necesidad.
- Subtitulo claro.
- CTA principal: "Ver opciones en PC MIDI Center" con link {CTA_URL}.

2. Qué problema resuelve esta búsqueda
- Resumir la necesidad real detectada.
- Mencionar que se observaron dudas en comunidades/web, sin inventar volumen.

3. Cómo elegir
- Criterios de decisión prácticos.
- Enfoque en categoría/producto, no promesas comerciales.

4. Comparativa o tabla de criterios
- Tabla simple si aplica.

5. Recomendación orientativa
- Qué tipo de producto mirar según caso de uso.
- No afirmar stock, precio ni disponibilidad.

6. Preguntas frecuentes
- 4 a 6 FAQs basadas en la evidencia.

7. CTA final
- Link a {CTA_URL}.
- Texto: "Ver opciones en PC MIDI Center".

Reglas:
- Usar español rioplatense claro.
- No decir "distribuidor oficial".
- No decir "soporte tecnico oficial".
- No decir que PCMidi fabrica Arturia, Midiplus ni terceros.
- No inventar URLs especificas de producto; usar solo {CTA_URL}.
"""
    markdown = chat(SYSTEM, user, temperature=0.25)
    # Verify output completeness; retry with shorter evidence if truncated
    if "## CTA Final" not in markdown:
        user_short = user.replace(evidence_text[:4000], evidence_text[:2000])
        markdown = chat(SYSTEM, user_short, temperature=0.25)
    
    # Add standard footer
    footer = """\n\n---\n\n*PC MIDI Center comercializa tecnología para producción musical. Las marcas mencionadas son propiedad de sus respectivos dueños. Consultá disponibilidad y asesoramiento personalizado.*"""
    markdown = markdown.strip() + footer
    
    title = topic[0].upper() + topic[1:]
    return LandingPage(topic=topic, title=title, slug=slugify(topic), markdown=markdown.strip(), cta_url=CTA_URL)
