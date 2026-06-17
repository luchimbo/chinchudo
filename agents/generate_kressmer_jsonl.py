"""Agrega las 6 landings Kressmer al JSONL de landings_aprobadas."""

import json
from pathlib import Path

LANDINGS_PATH = Path("data/landings_aprobadas.jsonl")

PRODUCTS = [
    {
        "slug": "kressmer-lm-281-piano-digital-mueble",
        "keyword": "Kressmer LM-281 piano digital 88 teclas mueble",
        "intent": "conocer el producto antes de comprar",
        "seo_title": "Kressmer LM-281 | Piano Digital 88 Teclas con Mueble | PC MIDI Center",
        "meta_description": "El Kressmer LM-281 es un piano digital de 88 teclas con accion de martillo, mueble integrado y Bluetooth. Disponible en PC MIDI Center.",
        "h1": "Kressmer LM-281: Piano Digital 88 Teclas con Mueble y Accion de Martillo",
        "hero_lede": "El LM-281 ofrece la experiencia mas completa de la linea Kressmer: accion de martillo, mueble estable, pedalera integrada y conectividad Bluetooth para estudiar y practicar en casa.",
        "components_title": "Mueble, pedales y accion de martillo incluidos.",
        "components_subtitle": "El LM-281 combina estructura de mueble, sistema de pedales y 88 teclas con accion de martillo — con Bluetooth dual, MIDI y salida para auriculares.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-lm-281"],
        "components": [
            {"cat": "Accion de martillo", "shortCat": "HAMMER", "why": "Permite desarrollar tecnica, dinamica y control expresivo mas cercano al piano acustico.", "look": "El LM-281 incluye 88 teclas con accion de martillo — diferencia clave respecto a teclas sensitivas estandar."},
            {"cat": "Mueble integrado", "shortCat": "MUEBLE", "why": "Aporta estabilidad total y postura mas natural durante la ejecucion.", "look": "El mueble viene incluido en la caja — no necesitas comprar soporte por separado."},
            {"cat": "Sistema de pedales", "shortCat": "PEDALES", "why": "Fundamental para trabajar tecnicas de sustain, sostenuto y damper desde el inicio.", "look": "La pedalera triple viene incluida con el instrumento."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el mueble y conecta la pedalera", "b": "Todo lo necesario viene en la caja. El armado es directo sin herramientas especiales."},
            {"n": "02", "t": "Conecta via Bluetooth o USB", "b": "Soporta Bluetooth dual y USB para conectarse a apps de aprendizaje, DAW o clases online."},
            {"n": "03", "t": "Practica con auriculares o en voz alta", "b": "La salida para auriculares permite practicar en silencio a cualquier hora."},
        ],
        "benefits": [
            {"n": "01", "t": "La opcion mas completa de Kressmer", "b": "Mueble, pedales, accion de martillo y conectividad completa en un solo instrumento."},
            {"n": "02", "t": "Ideal para estudio serio en casa", "b": "La accion de martillo permite desarrollar tecnica real desde las primeras etapas de aprendizaje."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad y opciones de compra directamente en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Incluye los tres pedales?", "a": "Si. El LM-281 viene con sistema de pedales integrado: sustain, sostenuto y damper."},
            {"q": "Cual es la diferencia entre accion de martillo y teclas sensitivas?", "a": "Las teclas sensitivas responden a la fuerza del toque. La accion de martillo agrega peso mecanico progresivo, mucho mas cercano al piano acustico real."},
            {"q": "Puedo practicar en silencio?", "a": "Si. Tiene salida para auriculares (jack estereo) para practica privada sin molestar el entorno."},
            {"q": "Funciona con apps como Simply Piano o Flowkey?", "a": "Si. La conectividad Bluetooth y USB lo hace compatible con las principales apps de aprendizaje musical."},
        ],
    },
    {
        "slug": "kressmer-lm-200-piano-digital-principiantes",
        "keyword": "Kressmer LM-200 piano digital principiantes",
        "intent": "primer piano para principiantes",
        "seo_title": "Kressmer LM-200 | Piano Digital 88 Teclas para Principiantes | PC MIDI Center",
        "meta_description": "El Kressmer LM-200 es un piano digital de 88 teclas sensitivas con Bluetooth, ideal para principiantes. Disponible en PC MIDI Center.",
        "h1": "Kressmer LM-200: El Primer Piano Digital de 88 Teclas para Principiantes",
        "hero_lede": "El LM-200 ofrece 88 teclas sensitivas, sonido de piano puro y Bluetooth — todo lo necesario para empezar con el instrumento correcto desde el primer dia.",
        "components_title": "88 teclas, Bluetooth y apps de aprendizaje incluidos.",
        "components_subtitle": "El LM-200 esta pensado para quienes empiezan: teclas sensitivas de tamano real, sonido claro, practica silenciosa y conexion Bluetooth para apps interactivas.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-lm-200"],
        "components": [
            {"cat": "88 teclas sensitivas", "shortCat": "TECLAS", "why": "El tamano completo evita tener que cambiar de instrumento al avanzar. Las teclas sensitivas dan respuesta dinamica real.", "look": "El LM-200 tiene 88 teclas standard sensibles a la velocidad — igual que cualquier piano de concierto."},
            {"cat": "Bluetooth y APPs", "shortCat": "APPS", "why": "Apps como Simply Piano o Flowkey guian el aprendizaje con feedback en tiempo real.", "look": "La conexion Bluetooth dual permite conectar el celular sin cables para apps de aprendizaje."},
            {"cat": "Practica silenciosa", "shortCat": "AUDIO", "why": "La salida para auriculares permite practicar a cualquier hora sin molestar a nadie.", "look": "El jack de auriculares funciona con cualquier auricular estandar."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el soporte en minutos", "b": "Las patas metalicas y el atril vienen en la caja. Listo para tocar desde el primer dia."},
            {"n": "02", "t": "Conecta a tu app favorita", "b": "Bluetooth dual para conectar el celular sin cables a Simply Piano, Flowkey u otras apps."},
            {"n": "03", "t": "Practica cuando quieras", "b": "Conecta auriculares y practica en silencio a cualquier hora."},
        ],
        "benefits": [
            {"n": "01", "t": "El instrumento correcto desde el inicio", "b": "88 teclas de tamano real para no quedarse corto al avanzar en el aprendizaje."},
            {"n": "02", "t": "Listo para conectar y aprender", "b": "Bluetooth, USB y soporte para apps de aprendizaje integrados desde el primer dia."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad y opciones de compra en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Por que es importante empezar con 88 teclas?", "a": "Empezar con 88 teclas evita tener que cambiar de instrumento al avanzar. Es la medida estandar de todo piano real."},
            {"q": "Que diferencia hay entre teclas sensitivas y accion de martillo?", "a": "Las sensitivas responden a la fuerza del toque. La accion de martillo agrega peso mecanico progresivo. Para principiantes, las sensitivas son una excelente opcion de inicio."},
            {"q": "Viene con soporte o necesito comprar uno?", "a": "Viene con patas metalicas incluidas. Tambien es compatible con soporte tipo X si preferis otra altura."},
            {"q": "Puedo conectarlo a la PC para grabar?", "a": "Si. El puerto USB y la interfaz MIDI permiten conectarlo a software como GarageBand, MuseScore o cualquier DAW."},
        ],
    },
    {
        "slug": "kressmer-lm-103-piano-digital-marron",
        "keyword": "Kressmer LM-103 piano digital marron",
        "intent": "piano para el hogar con disenio clasico",
        "seo_title": "Kressmer LM-103 | Piano Digital 88 Teclas Color Marron | PC MIDI Center",
        "meta_description": "El Kressmer LM-103 es un piano digital de 88 teclas con diseño marron clasico, Bluetooth dual y pedalera incluida. Disponible en PC MIDI Center.",
        "h1": "Kressmer LM-103: Piano Digital 88 Teclas con Estetica Clasica en Marron",
        "hero_lede": "El LM-103 combina funcionalidad moderna con estetica calida: diseño marron elegante, 88 teclas sensitivas, Bluetooth, apps de aprendizaje y pedalera incluida.",
        "components_title": "Diseño clasico con tecnologia moderna.",
        "components_subtitle": "El LM-103 esta pensado para quienes quieren un piano que se vea bien y funcione bien: color marron calido, pedalera incluida y conectividad completa.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-lm-103"],
        "components": [
            {"cat": "88 teclas sensitivas", "shortCat": "TECLAS", "why": "Interpretacion expresiva y dinamica desde el primer dia.", "look": "Teclas standard sensibles a la velocidad — responden a la intensidad de cada toque."},
            {"cat": "Diseño en marron", "shortCat": "DISEÑO", "why": "El color marron calido encaja con ambientes clasicos y de madera — el instrumento se integra al espacio.", "look": "Acabado elegante pensado para hogar, estudio y sala de musica."},
            {"cat": "Pedalera incluida", "shortCat": "PEDALES", "why": "Para trabajar sustain y expresion desde el inicio sin comprar accesorios aparte.", "look": "La pedalera viene en la caja junto con el instrumento."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el soporte con las patas metalicas", "b": "Viene con patas metalicas y atril incluidos — armado rapido sin herramientas especiales."},
            {"n": "02", "t": "Conecta la pedalera y empieza a tocar", "b": "La pedalera viene incluida. Lista para trabajar sustain desde la primera sesion."},
            {"n": "03", "t": "Conecta via Bluetooth a tu app favorita", "b": "Bluetooth dual para apps de aprendizaje, musica o control desde el celular."},
        ],
        "benefits": [
            {"n": "01", "t": "Estetica y funcionalidad en uno", "b": "El diseño marron elegante combina con cualquier espacio del hogar sin resignar funciones."},
            {"n": "02", "t": "Pedalera incluida desde el inicio", "b": "No necesitas comprar accesorios extras — la pedalera viene lista para usar."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "El LM-103 y el LM-200 son lo mismo?", "a": "Son similares en funcionalidad. El LM-103 se diferencia por el color marron, la pedalera incluida y algunas funciones adicionales de conectividad."},
            {"q": "La pedalera tiene los 3 pedales?", "a": "El LM-103 incluye pedalera. Para el detalle exacto de los pedales incluidos, consulta con PC MIDI Center."},
            {"q": "Funciona con apps de piano?", "a": "Si. La conexion Bluetooth y USB lo hace compatible con Simply Piano, Flowkey y otras apps principales."},
            {"q": "Es facil de armar?", "a": "Si. Viene con patas metalicas y atril incluidos — se arma en pocos minutos sin herramientas."},
        ],
    },
    {
        "slug": "kressmer-k-180-piano-digital-blanco-128-tonos",
        "keyword": "Kressmer K-180 piano digital blanco 128 tonos",
        "intent": "piano con variedad de sonidos y ritmos",
        "seo_title": "Kressmer K-180 | Piano Digital 88 Teclas Blanco con 128 Tonos | PC MIDI Center",
        "meta_description": "El Kressmer K-180 tiene 88 teclas, 128 tonos, 128 ritmos y diseño blanco elegante. Disponible en PC MIDI Center.",
        "h1": "Kressmer K-180: Piano Digital 88 Teclas Blanco con 128 Tonos y Ritmos",
        "hero_lede": "El K-180 va mas alla del piano puro: 128 tonos, 128 ritmos, 80 canciones de demostracion y diseño blanco moderno para estudiantes que quieren explorar mas mientras aprenden.",
        "components_title": "128 tonos, 128 ritmos y diseño blanco moderno.",
        "components_subtitle": "El K-180 es la opcion de Kressmer para quienes quieren mas versatilidad: distintos timbres, acompañamientos ritmicos, canciones de demo y un panel multifuncion intuitivo.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-k-180"],
        "components": [
            {"cat": "128 tonos", "shortCat": "TONOS", "why": "Permite explorar distintos timbres y mantener la practica variada e interesante.", "look": "Piano, organo, cuerdas, pad y mas — 128 opciones de sonido incluidas."},
            {"cat": "128 ritmos", "shortCat": "RITMOS", "why": "Ideal para practicar con acompañamientos y trabajar el tempo de forma natural.", "look": "128 estilos de acompañamiento para practicar con distintos generos musicales."},
            {"cat": "80 canciones demo", "shortCat": "DEMOS", "why": "Referencia auditiva y practica incluida desde el inicio.", "look": "80 canciones de demostracion para escuchar la calidad del sonido y practicar pasajes."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el soporte con atril y pedalera", "b": "Todo viene en la caja. Listo para tocar desde el primer dia."},
            {"n": "02", "t": "Explora los 128 tonos y ritmos", "b": "Usa el panel multifuncion para cambiar timbres y activar ritmos de acompañamiento."},
            {"n": "03", "t": "Conecta a apps o software musical", "b": "Bluetooth dual y USB/MIDI para apps de aprendizaje y produccion."},
        ],
        "benefits": [
            {"n": "01", "t": "Mas versatilidad que un piano puro", "b": "128 tonos y ritmos para mantener la practica variada e interesante."},
            {"n": "02", "t": "Diseño blanco moderno", "b": "Estetica elegante que se integra a cualquier espacio contemporaneo."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Los 128 tonos son utiles para un principiante?", "a": "Si. Permiten practicar con distintos timbres y explorar mas alla del piano sin necesidad de equipo adicional."},
            {"q": "Las 80 canciones demo son canciones reales?", "a": "Son demostraciones del instrumento — utiles para escuchar la calidad del sonido y como referencia de practica."},
            {"q": "El blanco se ensucia facil?", "a": "El acabado es plastico liso — se limpia facilmente con paño humedo."},
            {"q": "Tiene funcion de manos separadas?", "a": "El K-180 incluye Smart Follow-up y funciones de estudio. Para el detalle exacto, consulta con PC MIDI Center."},
        ],
    },
    {
        "slug": "kressmer-k-88-piano-digital-rojo-hammer",
        "keyword": "Kressmer K-88 piano digital rojo hammer action",
        "intent": "piano de escenario con accion de martillo",
        "seo_title": "Kressmer K-88 | Piano Digital 88 Teclas Rojo Hammer Action | PC MIDI Center",
        "meta_description": "El Kressmer K-88 tiene 88 teclas con accion de martillo, chip de sonido frances 5704 y diseño rojo distintivo. Disponible en PC MIDI Center.",
        "h1": "Kressmer K-88: Piano Digital 88 Teclas Rojo con Accion de Martillo",
        "hero_lede": "El K-88 combina presencia escenica y calidad de sonido: accion tipo martillo, chip de sonido frances 5704 y diseño rojo que lo distingue de cualquier otro piano del espacio.",
        "components_title": "Hammer action, sonido frances y diseño rojo unico.",
        "components_subtitle": "El K-88 esta pensado para musicos que quieren accion de martillo y presencia visual — en formato piano de escenario, sin el peso de un modelo con mueble.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-k-88"],
        "components": [
            {"cat": "Accion tipo martillo", "shortCat": "HAMMER", "why": "Mayor realismo en el toque y mejor desarrollo de tecnica que teclas sensitivas estandar.", "look": "Step-hammer action en las 88 teclas — mas realista que sensitivas, en formato portable."},
            {"cat": "Chip de sonido frances 5704", "shortCat": "SONIDO", "why": "El procesador define el caracter del sonido. El 5704 esta orientado a respuesta clara y musical.", "look": "Chip seleccionado especificamente para respuesta timbrica sin coloraciones artificiales."},
            {"cat": "Diseño rojo", "shortCat": "DISEÑO", "why": "El color rojo hace que el instrumento sea parte de la estetica del espacio — unico en la linea Kressmer.", "look": "Formato piano de escenario con presencia visual maxima."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el soporte con atril y pedalera", "b": "Atril y pedalera incluidos en la caja. Listo para tocar desde el primer dia."},
            {"n": "02", "t": "Ajusta el volumen y empieza", "b": "El panel de tono simple hace que configurar el K-88 sea directo y rapido."},
            {"n": "03", "t": "Toca — el instrumento hace el resto", "b": "La accion de martillo y el chip frances dan una respuesta que se siente diferente desde la primera nota."},
        ],
        "benefits": [
            {"n": "01", "t": "Accion de martillo en formato portable", "b": "Sin el peso ni el espacio de un modelo con mueble — mismo realismo de toque."},
            {"n": "02", "t": "Sonido diferenciado", "b": "El chip de sonido frances 5704 da un caracter timbrico claro y musical."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Que es el chip de sonido frances 5704?", "a": "Es el procesador de audio integrado. El 5704 esta orientado a una respuesta clara, sin coloraciones artificiales."},
            {"q": "Que diferencia hay entre step-hammer y hammer action completa?", "a": "El step-hammer simula el peso progresivo del martillo. Es mas realista que teclas sensitivas, sin llegar al peso completo de un piano de mueble."},
            {"q": "Tiene Bluetooth o MIDI?", "a": "El K-88 prioriza simplicidad y sonido directo. Para conectividad avanzada, los modelos LM-200 o LM-281 son mejores opciones."},
            {"q": "Es portable?", "a": "Si. El formato de piano de escenario lo hace facil de mover entre habitaciones, aulas o espacios de ensayo."},
        ],
    },
    {
        "slug": "kressmer-3008-piano-modular-portable",
        "keyword": "Kressmer 3008 piano modular portable 88 teclas",
        "intent": "piano portable facil de guardar y transportar",
        "seo_title": "Kressmer 3008 | Piano Digital Modular 88 Teclas Portable | PC MIDI Center",
        "meta_description": "El Kressmer 3008 es un piano modular de 88 teclas que se divide en dos con imanes. 600 timbres, MIDI y microfono. Disponible en PC MIDI Center.",
        "h1": "Kressmer 3008: El Piano Digital de 88 Teclas que se Divide en Dos para Guardarlo Facil",
        "hero_lede": "El 3008 resuelve el problema de espacio sin sacrificar las 88 teclas: se divide en dos secciones con conexion magnetica, y trae 600 timbres, metronomos, MIDI y entrada para microfono.",
        "components_title": "Modular, magnetico y con 600 timbres.",
        "components_subtitle": "El 3008 es el piano de Kressmer para quienes necesitan portabilidad real: se arma y se desarma en segundos, se guarda en la mitad del espacio y no resigna funciones.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": ["teclados", "instrumentos"],
        "product_ids": ["kressmer-3008"],
        "components": [
            {"cat": "Diseño modular magnetico", "shortCat": "MODULAR", "why": "Se arma y desarma en segundos. Ocupa la mitad del espacio de un piano convencional al guardarlo.", "look": "Dos secciones unidas con imanes — firmes durante la ejecucion, rapidas de separar para guardar."},
            {"cat": "600 timbres y ritmos", "shortCat": "SONIDOS", "why": "Una de las mayores variedades de la linea Kressmer — para explorar y practicar con acompañamientos.", "look": "600 timbres, 600 ritmos y 128 canciones de demostracion incluidas."},
            {"cat": "Entrada para microfono", "shortCat": "MIC", "why": "Permite cantar y tocar al mismo tiempo — util para clases, ensayos o practica con voz.", "look": "Entrada de microfono integrada, sin necesidad de equipo adicional."},
        ],
        "steps": [
            {"n": "01", "t": "Arma el 3008 en segundos", "b": "Une las dos secciones magneticas, coloca el atril y conecta el pedal de sustain — listo para tocar."},
            {"n": "02", "t": "Explora los 600 timbres y ritmos", "b": "Usa las 3 pantallas LED y el panel para navegar sonidos, ritmos y funciones."},
            {"n": "03", "t": "Practica con metronomos y demos", "b": "128 canciones de demostracion y metronomos incorporados para estudiar con precision ritmica."},
        ],
        "benefits": [
            {"n": "01", "t": "La solucion de portabilidad de Kressmer", "b": "Se guarda en la mitad del espacio sin perder las 88 teclas ni las funciones completas."},
            {"n": "02", "t": "El mas completo en funciones", "b": "600 timbres, 600 ritmos, microfono, MIDI, metronomos y 3 pantallas LED en un solo instrumento."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "La conexion magnetica es resistente durante la ejecucion?", "a": "Si. Las dos secciones quedan fijas durante la ejecucion. El sistema magnetico esta disenado para el uso normal de practica y transporte."},
            {"q": "El Bluetooth viene incluido o es opcional?", "a": "Segun la version disponible. Consulta con PC MIDI Center para confirmar que incluye el modelo en stock."},
            {"q": "Puedo conectar un microfono estandar?", "a": "Si. Tiene entrada de microfono integrada, ideal para cantar mientras tocas o para clases."},
            {"q": "Es buen piano para ninos?", "a": "Si. Las 88 teclas sensitivas, el metronomos y las 128 canciones demo lo hacen muy util para el aprendizaje. El diseño modular facilita guardarlo entre sesiones."},
        ],
    },
]


def check_existing_slugs() -> set:
    slugs = set()
    if LANDINGS_PATH.exists():
        with open(LANDINGS_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        d = json.loads(line)
                        slugs.add(d.get("slug", ""))
                    except json.JSONDecodeError:
                        pass
    return slugs


def main() -> None:
    existing = check_existing_slugs()
    new_products = [p for p in PRODUCTS if p["slug"] not in existing]

    if not new_products:
        print("Todas las landings Kressmer ya existen en el JSONL.")
        return

    with open(LANDINGS_PATH, "a", encoding="utf-8") as f:
        for product in new_products:
            f.write(json.dumps(product, ensure_ascii=False) + "\n")
            print(f"  Agregada: {product['slug']}")

    print(f"\n{len(new_products)} landings Kressmer agregadas al JSONL.")
    print("Corre ahora: python build_landings.py build")


if __name__ == "__main__":
    main()
