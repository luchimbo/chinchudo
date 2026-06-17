"""Genera e inserta las 6 landing pages de productos Kressmer en la DB."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from authority_swarm.db import init_db, insert_landing_page
from authority_swarm.models import LandingPage

CTA_URL = "https://www.pcmidi.com.ar/"

PRODUCTS = [
    {
        "slug": "kressmer-lm-281-piano-digital-88-teclas-mueble",
        "title": "Kressmer LM-281 — Piano Digital 88 Teclas con Mueble y Acción de Martillo",
        "topic": "Kressmer LM-281",
        "markdown": f"""# Kressmer LM-281: Piano Digital de 88 Teclas con Mueble y Acción de Martillo

El piano que se siente como el real — con estabilidad, pedales y conectividad moderna.

**[Ver Kressmer LM-281 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el LM-281?

El Kressmer LM-281 está pensado para quienes buscan una experiencia de piano completa en casa, sin resignar nada:

- **Estudiantes intermedios y avanzados** que necesitan acción de martillo real para desarrollar técnica y dinámica.
- **Músicos adultos** que quieren un instrumento estable, con presencia visual y sistema de pedales integrado.
- **Hogares y academias** donde la estética y la comodidad de ejecución importan tanto como el sonido.

---

## Lo que lo hace diferente

| Característica | Qué significa para vos |
|---|---|
| 88 teclas con acción de martillo | Sensación más cercana al piano acústico, ideal para desarrollar control dinámico |
| Mueble / estructura integrada | Estabilidad total, postura natural, sin soporte externo |
| Sistema de pedales incluido | Sustain, sostenuto y damper — técnica completa desde el día uno |
| Bluetooth dual + APP inteligente | Práctica guiada, apps de aprendizaje, conexión inalámbrica sin cables |
| Salida para auriculares | Practicá a cualquier hora sin molestar |
| USB + MIDI + Audio In/Out | Compatible con DAW, clases online y software musical |

---

## Especificaciones principales

- **Teclas:** 88 con acción de martillo (hammer action)
- **Sonido:** Piano puro — claro y natural
- **Conectividad:** Bluetooth dual, USB, MIDI, entrada/salida de audio, auriculares
- **Extras:** APP inteligente, mueble integrado, pedalera
- **Qué incluye:** Piano, mueble, pedalera, fuente de alimentación, manual

---

## Preguntas frecuentes

**¿Incluye los tres pedales operacionales?**
Sí. Viene con sistema de pedales integrado: sustain (damper), sostenuto y soft — fundamentales para técnica pianística real.

**¿Es adecuado para estudiantes avanzados?**
Absolutamente. La acción de martillo permite desarrollar control dinámico progresivo, y la conectividad MIDI/APP soporta entornos de estudio modernos.

**¿Puedo practicar en silencio?**
Sí. Tiene salida dedicada para auriculares (jack estéreo) para práctica privada sin interrumpir el entorno.

**¿Funciona con apps de piano como Simply Piano o Flowkey?**
Sí. La conectividad Bluetooth y USB lo hace compatible con las principales apps de aprendizaje musical.

**¿Necesito comprar el mueble por separado?**
No. El mueble/estructura de soporte viene incluido en la caja junto con la pedalera.

---

**[Ver disponibilidad del Kressmer LM-281 en PC MIDI Center →]({CTA_URL})**
""",
    },
    {
        "slug": "kressmer-lm-200-piano-digital-88-teclas-principiantes",
        "title": "Kressmer LM-200 — Piano Digital 88 Teclas para Principiantes con Bluetooth",
        "topic": "Kressmer LM-200",
        "markdown": f"""# Kressmer LM-200: El Primer Piano Digital de 88 Teclas para Principiantes

Simple, completo y listo para tocar desde el primer día.

**[Ver Kressmer LM-200 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el LM-200?

El Kressmer LM-200 es la elección ideal para:

- **Principiantes absolutos** que quieren empezar con 88 teclas reales, no un teclado recortado.
- **Estudiantes en casa** que buscan un instrumento práctico, silencioso y con conectividad moderna.
- **Padres que buscan el primer piano para sus hijos** — completo, accesible y fácil de usar.

---

## Lo que incluye y para qué sirve

| Característica | Para qué lo usás |
|---|---|
| 88 teclas sensibles a la velocidad | Expresión musical real: tocás suave o fuerte y el piano responde |
| Sonido de piano puro | Experiencia clara y directa — sin ruido, sin distracción |
| Bluetooth dual | Conectá el celular sin cables para usar apps de música o reproducir audio |
| Soporte para APPs inteligentes | Simply Piano, Flowkey, Playground Sessions — aprendé con guía interactiva |
| Salida para auriculares | Practicá en silencio a cualquier hora |
| USB + MIDI | Conectá a computadora o software musical cuando estés listo para más |
| Patas metálicas + atril incluidos | Listo para instalar y tocar desde el primer día |

---

## Especificaciones principales

- **Teclas:** 88 standard sensibles a la velocidad
- **Sonido:** Piano puro
- **Conectividad:** Bluetooth dual, USB, MIDI, entrada/salida de audio, auriculares
- **Diseño:** Negro compacto, compatible con soporte tipo X
- **Qué incluye:** Piano, atril, patas metálicas, fuente, manual

---

## Preguntas frecuentes

**¿Las 88 teclas son necesarias para un principiante?**
Sí. Empezar con 88 teclas evita tener que cambiar de instrumento cuando avanzás. Es la medida estándar de todo piano real.

**¿Qué diferencia hay entre sensitivo y acción de martillo?**
Las teclas sensitivas responden a la fuerza del toque (dinámicas). La acción de martillo agrega peso mecánico progresivo, más cercano al piano acústico. Para principiantes, las sensitivas son perfectas para empezar.

**¿Viene con soporte o necesito comprar uno aparte?**
Viene con patas metálicas incluidas. También es compatible con soporte tipo X si preferís una altura diferente.

**¿Puedo conectarlo a la PC para grabar?**
Sí. El puerto USB y la interfaz MIDI permiten conectarlo a software como GarageBand, MuseScore o cualquier DAW.

---

**[Ver disponibilidad del Kressmer LM-200 en PC MIDI Center →]({CTA_URL})**
""",
    },
    {
        "slug": "kressmer-lm-103-piano-digital-marron-bluetooth",
        "title": "Kressmer LM-103 — Piano Digital 88 Teclas Color Marrón con Bluetooth",
        "topic": "Kressmer LM-103",
        "markdown": f"""# Kressmer LM-103: Piano Digital 88 Teclas con Estética Clásica en Marrón

La calidez del piano tradicional con la tecnología del presente.

**[Ver Kressmer LM-103 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el LM-103?

El Kressmer LM-103 está pensado para quienes valoran tanto la música como la estética del instrumento:

- **Hogares que buscan un piano que se vea bien** — el marrón cálido encaja con ambientes clásicos y de madera.
- **Estudiantes y principiantes** que quieren un instrumento completo con conectividad moderna.
- **Músicos que priorizan el diseño** sin resignar funcionalidad.

---

## Características principales

| Característica | Detalle |
|---|---|
| 88 teclas sensibles a la velocidad | Interpretación expresiva y dinámica |
| Sonido de piano puro | Claro, directo y natural |
| Bluetooth dual | Conexión inalámbrica con dispositivos compatibles |
| APPs inteligentes | Aprendizaje guiado con apps de piano |
| Salida para auriculares (Follow-up) | Práctica silenciosa en cualquier momento |
| USB + MIDI | Conexión con computadora y software musical |
| Entrada y salida de audio | Mayor versatilidad de conexión |
| Programa Bluetooth Mini | Control ampliado desde el celular |
| Pedalera incluida | Para trabajar sustain desde el inicio |
| Diseño en marrón | Estética cálida y elegante para el hogar |

---

## Especificaciones principales

- **Teclas:** 88 standard sensibles a la velocidad
- **Sonido:** Piano puro
- **Color:** Marrón
- **Conectividad:** Bluetooth dual, USB, MIDI, entrada/salida de audio, auriculares
- **Qué incluye:** Piano, atril, patas metálicas, pedalera, fuente, manual

---

## Preguntas frecuentes

**¿El LM-103 es igual al LM-200 pero en marrón?**
Son muy similares en funcionalidad, con algunas diferencias en conectividad (el LM-103 incluye Bluetooth Mini y función de extensión). La diferencia más visible es el color marrón y que viene con pedalera incluida.

**¿La pedalera tiene los 3 pedales?**
El LM-103 incluye pedalera. Para la configuración exacta de pedales, consultá con PC MIDI Center.

**¿Funciona con Simply Piano o Flowkey?**
Sí. La conexión Bluetooth y USB lo hace compatible con las apps principales de aprendizaje de piano.

**¿Es fácil de armar?**
Sí. Viene con patas metálicas y atril incluidos — se arma sin herramientas en pocos minutos.

---

**[Ver disponibilidad del Kressmer LM-103 en PC MIDI Center →]({CTA_URL})**
""",
    },
    {
        "slug": "kressmer-k-180-piano-digital-blanco-128-tonos",
        "title": "Kressmer K-180 — Piano Digital 88 Teclas Blanco con 128 Tonos y Ritmos",
        "topic": "Kressmer K-180",
        "markdown": f"""# Kressmer K-180: Piano Digital 88 Teclas en Blanco con 128 Tonos y Ritmos

Para estudiantes que quieren explorar más allá del piano puro.

**[Ver Kressmer K-180 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el K-180?

El Kressmer K-180 es ideal para:

- **Estudiantes** que quieren practicar con acompañamientos rítmicos y explorar distintos sonidos.
- **Músicos curiosos** que quieren más que piano: órgano, cuerda, 128 opciones de timbres.
- **Hogares modernos** que buscan un piano blanco elegante con panel multifunción completo.

---

## Lo que te ofrece el K-180

| Característica | Detalle |
|---|---|
| 88 teclas sensibles a la velocidad | Técnica, dinámica y expresión musical real |
| 128 tonos | Piano, órgano, cuerdas, pad y más |
| 128 ritmos | Practicá con acompañamientos de distintos géneros |
| 80 canciones de demostración | Referencia y práctica auditiva incorporada |
| Panel de operación multifunción | Control directo de todas las funciones |
| Bluetooth dual + APP inteligente | Práctica guiada y conexión inalámbrica |
| Smart Follow-up | Sistema de acompañamiento para el estudio |
| Entrada para auriculares | Práctica silenciosa |
| USB + MIDI | Conexión con computadora y DAW |
| Diseño blanco | Moderno y elegante para cualquier espacio |

---

## Especificaciones principales

- **Teclas:** 88 standard sensibles a la velocidad
- **Tonos:** 128
- **Ritmos:** 128
- **Canciones demo:** 80
- **Color:** Blanco
- **Conectividad:** Bluetooth dual, USB, MIDI, entrada/salida de audio, auriculares
- **Qué incluye:** Piano, atril, pedalera, fuente, manual

---

## Preguntas frecuentes

**¿Los 128 tonos son útiles para un principiante?**
Sí — permiten practicar con distintos timbres, entender la dinámica de cada sonido y no aburrirse en la práctica diaria. Los ritmos son especialmente útiles para trabajar el tempo.

**¿Las 80 canciones demo son canciones reales?**
Son demostraciones del instrumento — sirven para escuchar la calidad del sonido y como referencia para practicar pasajes.

**¿Tiene función para practicar manos separadas?**
La función Smart Follow-up está pensada para acompañar el proceso de estudio. Para detalle exacto de sus modos, consultá con PC MIDI Center.

**¿El blanco se ensucia fácil?**
El acabado es plástico liso — se limpia fácilmente con paño húmedo.

---

**[Ver disponibilidad del Kressmer K-180 en PC MIDI Center →]({CTA_URL})**
""",
    },
    {
        "slug": "kressmer-k-88-piano-digital-rojo-hammer-action",
        "title": "Kressmer K-88 — Piano Digital 88 Teclas Rojo con Acción de Martillo",
        "topic": "Kressmer K-88",
        "markdown": f"""# Kressmer K-88: Piano Digital 88 Teclas en Rojo con Acción de Martillo

Presencia escénica, sonido francés y sensación de piano real.

**[Ver Kressmer K-88 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el K-88?

El Kressmer K-88 está pensado para quienes buscan algo diferente:

- **Músicos que quieren destacar** — el diseño rojo hace que el instrumento sea parte de la estética del espacio o del escenario.
- **Estudiantes y músicos intermedios** que quieren acción de martillo sin el costo de un modelo con mueble.
- **Quienes valoran la calidad de sonido** — el chip francés 5704 está elegido para una respuesta tímbrica clara y musical.

---

## Lo que lo hace único

| Característica | Detalle |
|---|---|
| 88 teclas con acción tipo martillo | Mayor realismo en el toque, mejor desarrollo de técnica |
| Chip de sonido francés 5704 | Diseñado para respuesta sonora clara y musical |
| Sonido de piano puro | Directo, sin saturaciones ni voces innecesarias |
| Panel de tono simple | Interfaz directa — tocás y punto |
| Formato tipo piano de escenario | Portable, estable, listo para usar en cualquier espacio |
| Diseño en rojo | Presencia visual única — diferente a todo |

---

## Especificaciones principales

- **Teclas:** 88 con acción tipo martillo (step-hammer action)
- **Sonido:** Piano puro con chip francés 5704
- **Color:** Rojo
- **Panel:** Simple y directo
- **Qué incluye:** Piano, atril, pedalera, fuente, manual

---

## Preguntas frecuentes

**¿Qué es el chip de sonido francés 5704?**
Es el procesador de audio integrado que define la calidad y el carácter del sonido. El 5704 está orientado a una respuesta clara, sin coloraciones artificiales.

**¿Qué diferencia hay entre step-hammer y hammer action completa?**
El step-hammer simula el peso progresivo del martillo en distintas zonas del teclado. Es un paso intermedio entre teclas estándar y la acción de martillo pesada de pianos de mueble. Para estudio y práctica, es muy efectivo.

**¿Tiene Bluetooth o MIDI?**
El K-88 está pensado como instrumento de práctica e interpretación directo — su diseño es simple por decisión. Para conectividad avanzada, los modelos LM-200 o LM-281 son mejores opciones.

**¿Es portable?**
Sí. El formato de piano de escenario lo hace fácil de mover entre habitaciones, aulas o espacios de ensayo.

---

**[Ver disponibilidad del Kressmer K-88 en PC MIDI Center →]({CTA_URL})**
""",
    },
    {
        "slug": "kressmer-3008-piano-digital-modular-88-teclas-portable",
        "title": "Kressmer 3008 — Piano Digital Modular 88 Teclas que se Divide en Dos",
        "topic": "Kressmer 3008",
        "markdown": f"""# Kressmer 3008: El Piano Digital de 88 Teclas que se Divide en Dos para Guardarlo Fácil

Portable, modular y completo — sin sacrificar las 88 teclas.

**[Ver Kressmer 3008 en PC MIDI Center →]({CTA_URL})**

---

## ¿Para quién es el 3008?

El Kressmer 3008 resuelve el problema de quienes quieren un piano completo pero con poco espacio:

- **Estudiantes en departamentos pequeños** — se guarda en la mitad del espacio de un piano tradicional.
- **Músicos que se mueven** — fácil de llevar a clases, ensayos o eventos.
- **Quienes quieren un instrumento completo sin resignar funciones** — 600 timbres, 600 ritmos, MIDI, auriculares, micrófono.

---

## La gran diferencia: diseño modular con conexión magnética

El 3008 se divide en **dos secciones que se unen con imanes**. Se arma y se desarma en segundos, sin herramientas. Guardado ocupa la mitad del espacio de un piano de 88 teclas convencional.

---

## Características completas

| Característica | Detalle |
|---|---|
| 88 teclas sensibles a la velocidad | Interpretación expresiva y técnica real |
| Diseño modular magnético | Divide, guarda y armá en segundos |
| 600 timbres | Amplia variedad de sonidos para explorar |
| 600 ritmos | Práctica con acompañamientos de cualquier género |
| 128 canciones de demostración | Referencia y aprendizaje auditivo |
| 3 pantallas LED digitales | Visualización clara de funciones |
| Metrónomo incorporado | Fundamental para desarrollar precisión rítmica |
| Entrada para micrófono | Cantá mientras tocás |
| Salida para auriculares | Práctica silenciosa |
| Puerto MIDI | Conexión con DAW y software musical |
| Bluetooth dual (opcional) | Conectividad inalámbrica según versión |
| Pedal de sustain incluido | Expresión musical completa desde el inicio |
| Ancho de tecla de 22 mm | Cómodo para estudio y práctica diaria |

---

## Especificaciones principales

- **Teclas:** 88 sensibles a la velocidad, ancho 22 mm
- **Timbres:** 600 | **Ritmos:** 600 | **Demos:** 128
- **Pantallas:** 3 LED digitales
- **Conectividad:** MIDI, auriculares, micrófono, audio in/out, Bluetooth dual (opcional)
- **Color:** Negro
- **Qué incluye:** Piano modular, atril, pedal de sustain, fuente, manual

---

## Preguntas frecuentes

**¿La conexión magnética es resistente?**
Sí. Las dos secciones quedan fijas durante la ejecución. El sistema magnético está diseñado para soportar el uso normal de práctica y transporte.

**¿Las teclas son del mismo tamaño que un piano normal?**
El ancho de tecla es de 22 mm, que es el estándar de pianos digitales. La sensación de ejecución es la habitual.

**¿El Bluetooth viene incluido o es opcional?**
Según la versión disponible. Consultá con PC MIDI Center para confirmar qué incluye el modelo que tenemos en stock.

**¿Puedo conectar un micrófono estándar?**
Sí. Tiene entrada para micrófono, ideal para cantar mientras tocás o para clases donde necesitás amplificar la voz.

**¿Es buen piano para niños?**
Sí — las 88 teclas sensitivas, el metrónomo y las 128 canciones demo lo hacen muy útil para el aprendizaje. El diseño modular también lo hace fácil de guardar entre sesiones.

---

**[Ver disponibilidad del Kressmer 3008 en PC MIDI Center →]({CTA_URL})**
""",
    },
]


def main() -> None:
    init_db()
    print("Generando 6 landing pages Kressmer...\n")
    for product in PRODUCTS:
        page = LandingPage(
            topic=product["topic"],
            title=product["title"],
            slug=product["slug"],
            markdown=product["markdown"],
            cta_url=CTA_URL,
            status="approved",
        )
        landing_id = insert_landing_page(page)
        print(f"  [{landing_id}] {product['title']}")
    print(f"\n✓ {len(PRODUCTS)} landings insertadas con status 'approved'.")
    print("Corrė ahora: python build_landings.py  para generar el sitio HTML.")


if __name__ == "__main__":
    main()
