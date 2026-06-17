LANDING_RESEARCH_TOPICS = [
    "que controlador Arturia sirve para Ableton",
    "MiniLab 3 o KeyLab para empezar",
    "MicroFreak vale la pena para home studio",
    "como usar Analog Lab con teclado MIDI",
    "donde comprar Arturia con asesoramiento",
    "Arturia vs Akai vs Novation",
    "placa de sonido para guitarra",
    "interfaz de audio para grabar voz",
    "controlador MIDI para FL Studio",
    "home studio para principiantes",
]

SECONDARY_INSTAGRAM_TAGS = [
    "arturia",
    "minilab3",
    "keylab",
    "keylabessential",
    "microfreak",
    "minifreak",
    "analoglab",
    "abletonlive",
    "controladormidi",
    "homestudio",
]


def localized_queries(topic: str) -> list[str]:
    return [
        topic,
        f"{topic} Argentina",
        f"{topic} Buenos Aires",
        f"{topic} opiniones",
        f"{topic} comparativa",
    ]
