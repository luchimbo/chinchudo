"""Language metadata and interface copy shared by every client's blog."""
import html
import re

LANGUAGES = {"es": "Español", "en": "English", "de": "Deutsch"}
COPY = {
    "en": {"Guía": "Guide", "Guías": "Guides", "Guia": "Guide", "Leer guia": "Read guide", "Explorar guías": "Explore guides", "Ver tienda": "Explore instruments", "Respuesta rápida": "Quick answer", "En esta guía": "In this guide", "Leé también": "Read also", "Antes de decidir": "Before you decide", "Errores frecuentes": "Common mistakes", "Dónde conseguirlo": "Explore the range", "Preguntas frecuentes": "Frequently asked questions", "Fuentes y referencias": "Sources and references", "Fuentes": "Sources", "Temas principales": "Topics", "Últimas guías": "Latest guides", "Guias destacadas": "Featured guides", "Guias para elegir mejor.": "Ideas for your next session.", "Ver todas las guías": "Explore all guides", "Ver guias": "Explore guides", "Ver catálogo": "Explore instruments", "Guías del tema": "Topic guides", "Todos los temas": "All topics", "Anterior": "Previous", "Siguiente": "Next", "Estamos preparando las primeras guías de este tema.": "New articles are on their way."},
    "de": {"Guía": "Ratgeber", "Guías": "Ratgeber", "Guia": "Ratgeber", "Leer guia": "Ratgeber lesen", "Explorar guías": "Ratgeber entdecken", "Ver tienda": "Instrumente entdecken", "Respuesta rápida": "Kurzantwort", "En esta guía": "In diesem Ratgeber", "Leé también": "Auch interessant", "Antes de decidir": "Vor der Entscheidung", "Errores frecuentes": "Häufige Fehler", "Dónde conseguirlo": "Sortiment entdecken", "Preguntas frecuentes": "Häufige Fragen", "Fuentes y referencias": "Quellen und Referenzen", "Fuentes": "Quellen", "Temas principales": "Themen", "Últimas guías": "Neueste Ratgeber", "Guias destacadas": "Ausgewählte Ratgeber", "Guias para elegir mejor.": "Ideen für deine nächste Session.", "Ver todas las guías": "Alle Ratgeber entdecken", "Ver guias": "Ratgeber entdecken", "Ver catálogo": "Instrumente entdecken", "Guías del tema": "Ratgeber zum Thema", "Todos los temas": "Alle Themen", "Anterior": "Zurück", "Siguiente": "Weiter", "Estamos preparando las primeras guías de este tema.": "Neue Beiträge erscheinen in Kürze."},
}

def language(value, fallback="es"):
    return value if isinstance(value, str) and value in LANGUAGES else fallback

def prefix(value):
    return "" if language(value) == "es" else "/" + value


def language_links(document, locale, alternates=None, navigation=None):
    tags = "".join(f'<link rel="alternate" hreflang="{html.escape(code)}" href="{html.escape(url, quote=True)}">' for code, url in (alternates or {}).items())
    if tags:
        document = document.replace("</head>", tags + "</head>", 1)
    links = navigation or alternates or {}
    if len(links) > 1:
        items = []
        for code, url in links.items():
            if code not in LANGUAGES:
                continue
            current = ' aria-current="page"' if code == locale else ""
            items.append(f'<a href="{html.escape(url, quote=True)}" lang="{code}"{current}>{LANGUAGES[code]}</a>')
        menu = '<nav aria-label="Language" style="display:flex;justify-content:flex-end;gap:18px;max-width:1180px;margin:12px auto;padding:0 16px;font:600 13px Arial,sans-serif">' + "".join(items) + '</nav>'
        document = document.replace("</header>", "</header>" + menu, 1)
    return document

def localize_html(document, locale, base_url="", alternates=None, navigation=None):
    locale = language(locale)
    if locale == "es":
        return language_links(document, locale, alternates, navigation)
    table = COPY[locale]
    extra = {
        "Guias": ("Guides", "Ratgeber"), "Temas": ("Topics", "Themen"), "Indice": ("Index", "Übersicht"), "Tienda": ("Instruments", "Instrumente"), "Explorar guias": ("Explore guides", "Ratgeber entdecken"), "Ir a la tienda": ("Explore instruments", "Instrumente entdecken"), "Ultimas guias": ("Latest guides", "Neueste Ratgeber"),
        "Entradas orientadas a problemas reales de compra: que conectar, que comparar y que categoria revisar antes de decidir.": ("Practical guides to help you compare options and make informed choices.", "Praktische Ratgeber, um Möglichkeiten zu vergleichen und fundierte Entscheidungen zu treffen."),
        "Empezá por un tema y avanzá desde la duda puntual hacia las guías que la desarrollan.": ("Start with a topic and explore the guides that answer your questions.", "Wähle ein Thema und entdecke die passenden Ratgeber zu deinen Fragen."),
        "Indice editorial de busquedas frecuentes, comparativas y decisiones de compra.": ("Explore practical questions, comparisons and buying guides.", "Entdecke praktische Fragen, Vergleiche und Kaufberatung."),
        "Guía práctica": ("Practical guide", "Praxisratgeber"), "Guía pilar": ("Complete guide", "Ausführlicher Ratgeber"), "Dudas comunes": ("Common questions", "Häufige Fragen"), "Guías relacionadas": ("Related guides", "Ähnliche Ratgeber"), "Guías de este tema": ("Topic guides", "Ratgeber zum Thema"), "Seguí explorando": ("Keep exploring", "Weiter entdecken"), "Cómo elegir según tu uso": ("Choosing for your needs", "Passend zu deinen Bedürfnissen wählen"), "Comparación para elegir": ("Compare your options", "Möglichkeiten vergleichen"), "Modelo": ("Model", "Modell"), "Para quién": ("Suitable for", "Geeignet für"), "Ventajas": ("Advantages", "Vorteile"), "Limitaciones y qué verificar": ("Limitations and what to check", "Grenzen und was du prüfen solltest"), "Fuentes y documentación": ("Sources and documentation", "Quellen und Dokumentation"),
    }
    table = {**table, **{key: values[0 if locale == "en" else 1] for key, values in extra.items()}}
    parts = re.split(r'(<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<[^>]+>)', document, flags=re.S | re.I)
    for index, part in enumerate(parts):
        if part.startswith("<script") or part.startswith("<style"):
            continue
        if part.startswith("<"):
            part = re.sub(r'(<html\b[^>]*\blang=)["\'][^"\']*["\']', rf'\1"{locale}"', part)
            part = re.sub(r'href="(/(?:guias/[^"\s]*|))"', lambda m: f'href="/{locale}{m[1]}"', part)
            if 'rel="canonical"' in part and base_url and f'href="{base_url.rstrip("/")}/"' in part:
                part = part.replace(f'href="{base_url.rstrip("/")}/"', f'href="{base_url.rstrip("/")}/{locale}/"')
            for source, translated in table.items():
                part = part.replace(f'aria-label="{source}"', f'aria-label="{translated}"')
            part = re.sub(r'content="Guias para elegir productos de (.*?) en Argentina\."', lambda m: f'content="{html.escape(("Practical guides from " if locale == "en" else "Praktische Ratgeber von ") + m[1], quote=True)}"', part)
        else:
            clean = part.strip()
            translated = table.get(clean)
            if translated:
                part = part.replace(clean, translated)
            part = re.sub(r'\bGuia (\d+)\b', ("Guide" if locale == "en" else "Ratgeber") + r' \1', part)
            part = re.sub(r'\b(\d+) guias\b', r'\1 ' + ("guides" if locale == "en" else "Ratgeber"), part)
            if clean.startswith("Por "):
                part = part.replace("Por ", "By " if locale == "en" else "Von ", 1).replace("Actualizado el", "Updated" if locale == "en" else "Aktualisiert am")
            part = part.replace(" · Guía práctica", " · Practical guide" if locale == "en" else " · Praxisratgeber").replace(" · Guía completa", " · Complete guide" if locale == "en" else " · Ausführlicher Ratgeber")
            for pattern, replacement in [
                (r"Guias de compra (.+)", r"\1 Journal"),
                (r"Elegir mejor con (.+)\.", (r"Explore your next idea with \1." if locale == "en" else r"Entdecke deine nächste Idee mit \1.")),
                (r"Comparativas y guias practicas para elegir los productos de (.+) segun tu uso real\.", (r"Practical guides and comparisons to explore \1 instruments for your needs." if locale == "en" else r"Praktische Ratgeber und Vergleiche zu Instrumenten von \1 für deine Bedürfnisse.")),
                (r"Catálogo comercial en (.+)\.", (r"Explore \1 instruments." if locale == "en" else r"Entdecke Instrumente von \1.")),
                (r"(.+) comercializa productos para sus clientes\. Este blog organiza guías por tema para ayudar a comparar alternativas según uso real\.", (r"\1 Journal · Practical ideas for your music." if locale == "en" else r"\1 Journal · Praktische Ideen für deine Musik.")),
            ]:
                if re.fullmatch(pattern, part.strip()):
                    part = re.sub(pattern, replacement, part.strip())
        parts[index] = part
    document = "".join(parts)
    return language_links(document, locale, alternates, navigation)


def apply_blog_theme(document, config):
    if config.get("landingTemplate") != "pro-dark":
        return document
    accent = config.get("landingPrimaryColor") or "#E85A2B"
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", accent):
        accent = "#E85A2B"
    style = f'''<style>:root{{--paper:#111;--paper-2:#1b1b1b;--ink:#fafafa;--muted:#aaa;--orange:{accent};--line:#333}}body{{background:#111;color:#fafafa;font-family:Inter,Arial,sans-serif}}header,footer{{border-color:#333}}.lede,.section-head p,.nav-links a,footer{{color:#aaa}}.guide-card,.topic-card{{background:#191919}}.guide-card-1{{background:#252525}}.hero:before{{opacity:.15}}.logo{{color:#fff}}.logo img{{max-height:50px;object-fit:contain}}.eyebrow{{background:#1b1b1b}}.btn-primary{{color:#111}}.cta-band{{background:#191919}}article{{border-color:#333}}</style>'''
    return document.replace("</head>", style + "</head>", 1)
