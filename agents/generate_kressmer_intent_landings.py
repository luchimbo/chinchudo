"""Agrega landings de intención/necesidad para productos Kressmer al JSONL."""

import json
from pathlib import Path

LANDINGS_PATH = Path("data/landings_aprobadas.jsonl")

INTENT_LANDINGS = [
    {
        "slug": "piano-digital-con-mueble-para-casa",
        "keyword": "piano digital con mueble para casa",
        "intent": "buscar piano digital estable con estructura propia para el hogar",
        "seo_title": "Piano Digital con Mueble para Casa | PC MIDI Center",
        "meta_description": "Si buscas un piano digital con mueble integrado para casa, el Kressmer LM-281 ofrece 88 teclas con accion de martillo, pedalera y Bluetooth. En PC MIDI Center.",
        "h1": "Piano Digital con Mueble para Casa: Por que Hace la Diferencia",
        "hero_lede": "Un piano digital con mueble integrado cambia la experiencia de estudio: mas estabilidad, postura natural y presencia visual en el hogar. El Kressmer LM-281 es la opcion de referencia en PC MIDI Center.",
        "components_title": "Mueble, pedales y accion de martillo en un solo instrumento.",
        "components_subtitle": "El LM-281 combina estructura integrada, pedalera triple y 88 teclas con accion de martillo — mas Bluetooth, MIDI y auriculares para conectarse a cualquier entorno digital.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-lm-281"],
        "components": [
            {"cat": "Mueble integrado", "shortCat": "MUEBLE", "why": "Aporta estabilidad total, postura natural y estetica elegante que un soporte externo no da.", "look": "El LM-281 viene con mueble incluido — no necesitas comprar estructura por separado."},
            {"cat": "Accion de martillo", "shortCat": "HAMMER", "why": "La sensacion de toque progresiva permite desarrollar tecnica real desde el inicio.", "look": "88 teclas con accion de martillo — mas cercano al piano acustico que las teclas sensitivas estandar."},
            {"cat": "Pedalera triple", "shortCat": "PEDALES", "why": "Sustain, sostenuto y damper — fundamentales para la tecnica pianistica correcta.", "look": "La pedalera viene incluida en la caja del LM-281."},
        ],
        "steps": [
            {"n": "01", "t": "Defini si necesitas mueble o soporte externo", "b": "El mueble integrado es mejor si el piano va a tener un lugar fijo. El soporte tipo X es mas flexible si necesitas moverlo."},
            {"n": "02", "t": "Verificá que tenga accion de martillo", "b": "Para estudio serio en casa, la accion de martillo marca la diferencia en el desarrollo tecnico."},
            {"n": "03", "t": "Considera la conectividad", "b": "Bluetooth, MIDI y auriculares son basicos para conectar apps de aprendizaje y practicar sin molestar."},
        ],
        "benefits": [
            {"n": "01", "t": "Estabilidad y comodidad real", "b": "El mueble integrado mejora la postura y hace que la ejecucion sea mas comoda que con cualquier soporte externo."},
            {"n": "02", "t": "Todo incluido en la caja", "b": "Mueble, pedalera, cables y manual — listo para armar y tocar desde el primer dia."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad del Kressmer LM-281 en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Por que conviene el mueble integrado sobre un soporte tipo X?", "a": "El mueble da mayor estabilidad, altura fija y estetica mas elegante. El soporte tipo X es mas portable pero menos estable durante la ejecucion."},
            {"q": "El LM-281 incluye la pedalera o hay que comprarla aparte?", "a": "La pedalera viene incluida en la caja del LM-281."},
            {"q": "Es necesaria la accion de martillo para estudiar piano en casa?", "a": "No es obligatoria para empezar, pero si el objetivo es desarrollar tecnica real, la accion de martillo marca una diferencia clara desde etapas intermedias."},
            {"q": "Donde puedo ver el Kressmer LM-281?", "a": "Esta disponible en PC MIDI Center — podes consultar disponibilidad en pcmidi.com.ar."},
        ],
    },
    {
        "slug": "piano-digital-para-principiantes-88-teclas",
        "keyword": "piano digital para principiantes 88 teclas",
        "intent": "elegir el primer piano digital sin saber por donde empezar",
        "seo_title": "Piano Digital para Principiantes 88 Teclas | PC MIDI Center",
        "meta_description": "Guia para elegir el primer piano digital de 88 teclas. Los modelos Kressmer LM-200 y LM-103 son opciones completas para principiantes en PC MIDI Center.",
        "h1": "Piano Digital para Principiantes: Por que Empezar con 88 Teclas",
        "hero_lede": "El primer piano digital define cuanto tiempo vas a poder usarlo antes de quedarte corto. Empezar con 88 teclas es la decision que evita cambiar de instrumento al avanzar.",
        "components_title": "88 teclas, apps de aprendizaje y practica silenciosa.",
        "components_subtitle": "Los modelos Kressmer LM-200 y LM-103 ofrecen lo esencial para principiantes: 88 teclas sensitivas, Bluetooth para apps interactivas y salida para auriculares.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-lm-200", "kressmer-lm-103"],
        "components": [
            {"cat": "88 teclas sensitivas", "shortCat": "TECLAS", "why": "El tamano completo evita quedarse corto al avanzar. Las teclas sensitivas responden a la dinamica del toque.", "look": "LM-200 y LM-103 tienen 88 teclas standard sensibles a la velocidad."},
            {"cat": "Apps de aprendizaje", "shortCat": "APPS", "why": "Simply Piano, Flowkey y similares guian el aprendizaje con feedback en tiempo real.", "look": "Ambos modelos tienen Bluetooth dual para conectar el celular sin cables."},
            {"cat": "Practica silenciosa", "shortCat": "AUDIO", "why": "La salida para auriculares permite practicar a cualquier hora sin molestar.", "look": "Jack de auriculares incluido en los dos modelos."},
        ],
        "steps": [
            {"n": "01", "t": "Empieza con 88 teclas — siempre", "b": "Los pianos de 61 o 76 teclas pueden quedar cortos en meses. 88 es el estandar y permite avanzar sin limites."},
            {"n": "02", "t": "Conecta a una app de aprendizaje", "b": "Simply Piano, Flowkey o Playground Sessions aceleran mucho el aprendizaje inicial con feedback inmediato."},
            {"n": "03", "t": "Practica con auriculares", "b": "La practica diaria es clave — los auriculares permiten hacerlo sin restricciones de horario o espacio."},
        ],
        "benefits": [
            {"n": "01", "t": "El instrumento correcto desde el dia uno", "b": "88 teclas para no quedarse corto, apps para aprender mas rapido, auriculares para practicar siempre."},
            {"n": "02", "t": "Dos opciones segun tu estetica", "b": "LM-200 en negro o LM-103 en marron — mismo nivel de funcionalidad, diferente diseño."},
            {"n": "03", "t": "Disponibles en PC MIDI Center", "b": "Consulta disponibilidad de los modelos Kressmer en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Cuantas teclas necesita un piano para principiantes?", "a": "88 teclas es lo recomendado. Los pianos de 61 o 76 teclas limitan el repertorio y la tecnica a medida que se avanza."},
            {"q": "Que diferencia hay entre el LM-200 y el LM-103?", "a": "Son similares en funcionalidad. El LM-103 viene en color marron y trae pedalera incluida. El LM-200 es negro y compatible con soporte tipo X."},
            {"q": "Las teclas sensitivas son suficientes para principiantes?", "a": "Si. La sensibilidad dinamica permite desarrollar expresion desde el inicio. La accion de martillo es mas relevante en etapas intermedias."},
            {"q": "Puedo aprender solo con apps conectadas al piano?", "a": "Si. La combinacion de Bluetooth y apps como Simply Piano es un punto de partida muy efectivo para principiantes."},
        ],
    },
    {
        "slug": "piano-digital-portatil-facil-de-guardar",
        "keyword": "piano digital portatil facil de guardar",
        "intent": "encontrar un piano digital portable para espacios pequenos",
        "seo_title": "Piano Digital Portatil Facil de Guardar | Kressmer 3008 | PC MIDI Center",
        "meta_description": "El Kressmer 3008 es un piano modular de 88 teclas que se divide en dos con imanes para guardarlo facil. Disponible en PC MIDI Center.",
        "h1": "Piano Digital Portatil y Facil de Guardar: La Solucion Modular",
        "hero_lede": "Si el espacio es un problema, el Kressmer 3008 resuelve el dilema: 88 teclas completas que se dividen en dos secciones magneticas — se guarda en la mitad del espacio de un piano convencional.",
        "components_title": "Modular, magnetico y con 600 timbres.",
        "components_subtitle": "El 3008 combina portabilidad real con funciones completas: division magnetica, 600 timbres, metronomos, MIDI y entrada para microfono.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-3008"],
        "components": [
            {"cat": "Diseño modular", "shortCat": "MODULAR", "why": "Dos secciones que se unen con imanes — firmes para tocar, rapidas de separar para guardar.", "look": "El 3008 ocupa la mitad del espacio de un piano convencional cuando esta guardado."},
            {"cat": "88 teclas completas", "shortCat": "TECLAS", "why": "No resignas el rango completo del instrumento por portabilidad.", "look": "88 teclas sensitivas de 22 mm de ancho — tamano estandar."},
            {"cat": "Funciones completas", "shortCat": "FUNCIONES", "why": "Portabilidad no significa resignar funciones — 600 timbres, ritmos, MIDI y microfono incluidos.", "look": "3 pantallas LED, pedal de sustain incluido y puerto MIDI."},
        ],
        "steps": [
            {"n": "01", "t": "Evalua tu espacio disponible", "b": "Si el piano va a estar en un lugar fijo, un modelo estandar alcanza. Si necesitas guardarlo o moverlo seguido, el diseño modular cambia todo."},
            {"n": "02", "t": "Arma el 3008 en segundos", "b": "Une las dos secciones, coloca el atril y conecta el pedal — listo sin herramientas."},
            {"n": "03", "t": "Practica con el instrumento completo", "b": "600 timbres, ritmos y metronomos para sesiones de practica variadas sin necesidad de equipo adicional."},
        ],
        "benefits": [
            {"n": "01", "t": "La solucion para espacios chicos", "b": "Se guarda en la mitad del espacio de un piano de 88 teclas convencional."},
            {"n": "02", "t": "Sin resignar funciones", "b": "600 timbres, 600 ritmos, MIDI, microfono y metronomos incluidos."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad del Kressmer 3008 en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Como funciona el sistema modular del 3008?", "a": "El piano se divide en dos secciones que se unen con imanes. Quedan firmes durante la ejecucion y se separan en segundos para guardar."},
            {"q": "Se nota la union entre las dos secciones al tocar?", "a": "La conexion magnetica esta disenada para que la experiencia de ejecucion sea continua. Para detalle tecnico, consulta con PC MIDI Center."},
            {"q": "Es mas liviano que un piano convencional?", "a": "Si. El formato modular y el diseño del 3008 estan pensados para facilitar el transporte y el almacenamiento."},
            {"q": "Tiene Bluetooth?", "a": "El Bluetooth dual es opcional segun version. Consulta disponibilidad en PC MIDI Center."},
        ],
    },
    {
        "slug": "piano-digital-hammer-action-economico",
        "keyword": "piano digital hammer action economico",
        "intent": "conseguir accion de martillo en un formato accesible sin mueble completo",
        "seo_title": "Piano Digital Hammer Action Economico | PC MIDI Center",
        "meta_description": "El Kressmer K-88 y el LM-281 ofrecen accion de martillo en distintos formatos y rangos. Disponibles en PC MIDI Center.",
        "h1": "Piano Digital con Hammer Action: Que Mirar antes de Comprar",
        "hero_lede": "La accion de martillo no tiene que significar un piano de sala con mueble pesado. Hay opciones en distintos formatos segun cuanto espacio tenes y cuanto priorizas la sensacion de toque.",
        "components_title": "Accion de martillo en dos formatos: escenario y mueble.",
        "components_subtitle": "El K-88 ofrece step-hammer action en formato portable y diseño rojo llamativo. El LM-281 agrega mueble integrado, pedalera completa y Bluetooth para el hogar.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-k-88", "kressmer-lm-281"],
        "components": [
            {"cat": "K-88: formato escenario", "shortCat": "K-88", "why": "Accion tipo martillo en formato portable, sin el peso y el espacio de un mueble.", "look": "Step-hammer action con chip de sonido frances 5704 y diseño rojo unico."},
            {"cat": "LM-281: formato mueble", "shortCat": "LM-281", "why": "Accion de martillo completa con mueble, pedalera integrada y conectividad total.", "look": "El modelo mas completo de la linea Kressmer para estudio en casa."},
            {"cat": "Diferencia entre step-hammer y hammer completo", "shortCat": "DIFERENCIA", "why": "Es util entender la diferencia para no pagar mas de lo necesario segun el nivel de estudio.", "look": "Step-hammer simula el peso progresivo. Hammer completo tiene contrapeso mecanico total."},
        ],
        "steps": [
            {"n": "01", "t": "Define si necesitas portabilidad o estabilidad", "b": "Si el piano va a moverse seguido, el K-88 en formato escenario es mas practico. Si va a tener lugar fijo, el LM-281 con mueble es la opcion."},
            {"n": "02", "t": "Evalua el nivel de estudio", "b": "Para iniciar y nivel intermedio, el step-hammer del K-88 funciona muy bien. Para estudio avanzado sostenido, el hammer completo del LM-281 da mas precision."},
            {"n": "03", "t": "Considera la conectividad", "b": "El LM-281 tiene Bluetooth, MIDI y apps. El K-88 prioriza simpleza — panel directo y sonido enfocado."},
        ],
        "benefits": [
            {"n": "01", "t": "Dos opciones para distintas necesidades", "b": "K-88 para portabilidad y presencia visual. LM-281 para estudio serio en casa con todo incluido."},
            {"n": "02", "t": "Accion de martillo sin pagar piano de sala", "b": "Kressmer ofrece hammer action en formatos accesibles sin resignar calidad de ejecucion."},
            {"n": "03", "t": "Disponibles en PC MIDI Center", "b": "Consulta disponibilidad de ambos modelos en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Que es el step-hammer action del K-88?", "a": "Simula el peso progresivo del martillo en distintas zonas del teclado. Es mas realista que teclas sensitivas puras, sin el peso completo de un piano de mueble."},
            {"q": "Vale la pena pagar mas por el LM-281 sobre el K-88?", "a": "Depende. Si queres mueble, pedalera triple, Bluetooth y hammer completo, el LM-281 lo justifica. Si priorizas portabilidad y simpleza, el K-88 alcanza."},
            {"q": "El chip de sonido frances 5704 del K-88 marca diferencia?", "a": "Esta orientado a una respuesta timbrica clara y musical — es parte de la propuesta sonora diferenciada del K-88."},
            {"q": "Donde estan disponibles?", "a": "Ambos modelos estan en PC MIDI Center — consulta en pcmidi.com.ar."},
        ],
    },
    {
        "slug": "piano-digital-para-practicar-en-silencio-departamento",
        "keyword": "piano digital para practicar en silencio departamento",
        "intent": "practicar piano sin molestar a vecinos en departamento",
        "seo_title": "Piano Digital para Practicar en Silencio en Departamento | PC MIDI Center",
        "meta_description": "Todos los pianos Kressmer tienen salida para auriculares para practicar en silencio en un departamento. Conocelos en PC MIDI Center.",
        "h1": "Piano Digital para Practicar en Silencio: Lo que Necesitas en un Departamento",
        "hero_lede": "Vivir en departamento no deberia limitar la practica musical. Todos los modelos Kressmer tienen salida para auriculares y se pueden usar a cualquier hora sin molestar.",
        "components_title": "Auriculares, volumen ajustable y conectividad discreta.",
        "components_subtitle": "El piano digital ideal para departamento tiene salida para auriculares, volumen ajustable y formato que no ocupa demasiado espacio. Kressmer tiene opciones para cada caso.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-lm-200", "kressmer-3008", "kressmer-k-180"],
        "components": [
            {"cat": "Salida para auriculares", "shortCat": "AUDIO", "why": "Permite practicar con sonido completo sin emitir ruido al exterior.", "look": "Todos los modelos Kressmer incluyen jack de auriculares estandar."},
            {"cat": "Espacio disponible", "shortCat": "ESPACIO", "why": "En departamento el espacio importa — hay opciones con soporte externo, mueble o diseño modular.", "look": "El 3008 modular ocupa la mitad del espacio. El LM-200 es compacto con patas desmontables."},
            {"cat": "Horario de practica", "shortCat": "HORARIO", "why": "Con auriculares podes practicar a cualquier hora sin restricciones de ruido.", "look": "El volumen es completamente independiente a traves de los auriculares."},
        ],
        "steps": [
            {"n": "01", "t": "Verifica que tenga salida para auriculares", "b": "Es la funcion mas importante para practicar en departamento. Todos los Kressmer la tienen incluida."},
            {"n": "02", "t": "Evalua el espacio disponible", "b": "Para espacios muy limitados, el 3008 modular es la opcion mas practica. Para espacio fijo, el LM-200 o K-180 son buenas alternativas."},
            {"n": "03", "t": "Considera el volumen de las sesiones", "b": "Con auriculares el volumen no afecta el entorno. Para practicar con parlante, el volumen ajustable es suficiente en horarios razonables."},
        ],
        "benefits": [
            {"n": "01", "t": "Practica sin restricciones de horario", "b": "Los auriculares te liberan del ruido — podes tocar a las 11 de la noche sin problema."},
            {"n": "02", "t": "Opciones para cada espacio", "b": "Desde el 3008 modular que se guarda facil hasta el LM-200 compacto con patas desmontables."},
            {"n": "03", "t": "Disponibles en PC MIDI Center", "b": "Consulta disponibilidad en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "El sonido del piano se escucha igual con auriculares que con parlante?", "a": "Si — la calidad del sonido es la misma. Los auriculares simplemente redirigen la salida de audio sin modificarla."},
            {"q": "Que auriculares convienen para practicar piano?", "a": "Auriculares cerrados son los mas recomendados para practica — aíslan el sonido exterior y no emiten ruido al ambiente. Cualquier auricular estandar de 3.5mm funciona con los modelos Kressmer."},
            {"q": "El piano hace ruido mecanico al tocar aunque este en silencio?", "a": "Las teclas sensitivas tienen ruido mecanico minimo. Las teclas con accion de martillo pueden tener algo mas de ruido fisico. Para departamento con paredes delgadas, vale consultarlo."},
            {"q": "Cual es el Kressmer mas compacto para departamento?", "a": "El 3008 modular es el mas practico para espacios reducidos — se divide en dos para guardarlo. El LM-200 con patas desmontables tambien es una buena opcion compacta."},
        ],
    },
    {
        "slug": "piano-digital-blanco-para-el-hogar",
        "keyword": "piano digital blanco para el hogar",
        "intent": "piano digital de color blanco que se integre a la decoracion del hogar",
        "seo_title": "Piano Digital Blanco para el Hogar | Kressmer K-180 | PC MIDI Center",
        "meta_description": "El Kressmer K-180 es un piano digital de 88 teclas en blanco con 128 tonos y ritmos. Disponible en PC MIDI Center.",
        "h1": "Piano Digital Blanco para el Hogar: Estetica y Funcionalidad",
        "hero_lede": "Un piano digital blanco es una pieza que define el espacio. El Kressmer K-180 combina diseño blanco elegante con 88 teclas, 128 tonos, ritmos y apps de aprendizaje.",
        "components_title": "Diseño blanco moderno con 128 tonos y ritmos.",
        "components_subtitle": "El K-180 no es solo una cuestion de color — trae 128 tonos, 128 ritmos, 80 canciones demo y Bluetooth para conectar apps de aprendizaje.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-k-180"],
        "components": [
            {"cat": "Diseño blanco elegante", "shortCat": "DISEÑO", "why": "Se integra a espacios modernos y luminosos — un instrumento que tambien es parte de la decoracion.", "look": "Acabado blanco del K-180 pensado para hogar, estudio y sala de musica."},
            {"cat": "128 tonos y ritmos", "shortCat": "SONIDOS", "why": "Mas versatilidad para explorar y practicar con distintos timbres y estilos.", "look": "Piano, organo, cuerdas y mas — 128 timbres distintos incluidos."},
            {"cat": "Bluetooth y apps", "shortCat": "APPS", "why": "Conectividad moderna para aprender con apps interactivas.", "look": "Bluetooth dual para conectar Simply Piano, Flowkey u otras apps sin cables."},
        ],
        "steps": [
            {"n": "01", "t": "Define el lugar del piano en el espacio", "b": "El K-180 con soporte externo se puede ubicar donde mejor encaje con la decoracion del hogar."},
            {"n": "02", "t": "Conecta a tu app de aprendizaje favorita", "b": "Bluetooth dual para apps interactivas sin cables — ideal para aprender de forma guiada."},
            {"n": "03", "t": "Explora los 128 tonos y ritmos", "b": "El panel multifuncion permite cambiar timbres y activar acompañamientos de forma intuitiva."},
        ],
        "benefits": [
            {"n": "01", "t": "Un piano que se integra al espacio", "b": "El blanco elegante del K-180 funciona en ambientes modernos y contemporaneos."},
            {"n": "02", "t": "Funciones mas alla del piano puro", "b": "128 tonos y 128 ritmos para explorar y no aburrirse en la practica diaria."},
            {"n": "03", "t": "Disponible en PC MIDI Center", "b": "Consulta disponibilidad del Kressmer K-180 en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "El acabado blanco del K-180 se ensucia facil?", "a": "Es plastico liso — se limpia facilmente con paño humedo."},
            {"q": "Conviene el K-180 para un principiante?", "a": "Si. Las 88 teclas sensitivas, las 80 canciones demo y el soporte para apps lo hacen muy completo para empezar."},
            {"q": "Que diferencia tiene el K-180 con el LM-200?", "a": "El K-180 agrega 128 tonos, 128 ritmos, 80 demos y panel multifuncion. El LM-200 es mas enfocado en piano puro. El K-180 es blanco; el LM-200 es negro."},
            {"q": "Viene con soporte o necesito comprar uno?", "a": "El K-180 viene con atril y pedalera. Para el soporte de teclado, consulta con PC MIDI Center."},
        ],
    },
    {
        "slug": "piano-digital-para-ninos-y-jovenes-aprender",
        "keyword": "piano digital para ninos y jovenes aprender",
        "intent": "elegir el primer piano digital para que un nino o adolescente aprenda",
        "seo_title": "Piano Digital para Ninos y Jovenes | Opciones Kressmer | PC MIDI Center",
        "meta_description": "Los modelos Kressmer LM-200 y K-180 son buenas opciones para que ninos y jovenes aprendan piano con 88 teclas, apps y practica silenciosa. En PC MIDI Center.",
        "h1": "Piano Digital para Ninos y Jovenes: Como Elegir el Primero",
        "hero_lede": "El primer piano define si el nino va a poder seguir avanzando o va a chocar con las limitaciones del instrumento en pocos meses. 88 teclas, apps de aprendizaje y auriculares son los tres pilares.",
        "components_title": "88 teclas, apps y practica silenciosa para empezar bien.",
        "components_subtitle": "Los modelos Kressmer LM-200 y K-180 combinan el tamano completo de 88 teclas con Bluetooth para apps interactivas y salida para auriculares — lo esencial para el aprendizaje.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-lm-200", "kressmer-k-180"],
        "components": [
            {"cat": "88 teclas desde el inicio", "shortCat": "TECLAS", "why": "Empezar con el tamano completo evita cambiar de instrumento al avanzar — una de las decisiones mas importantes.", "look": "LM-200 y K-180 tienen 88 teclas sensibles a la velocidad."},
            {"cat": "Apps de aprendizaje", "shortCat": "APPS", "why": "Apps como Simply Piano o Flowkey son un complemento muy efectivo para el aprendizaje autonomo y las clases.", "look": "Bluetooth dual en ambos modelos para conectar sin cables."},
            {"cat": "Practica sin molestar", "shortCat": "AUDIO", "why": "Los auriculares permiten que el nino practique en cualquier momento sin interrumpir la casa.", "look": "Salida para auriculares incluida en los dos modelos."},
        ],
        "steps": [
            {"n": "01", "t": "Siempre 88 teclas para el primer piano", "b": "Los instrumentos de 61 o 76 teclas quedan cortos rapido. 88 es la medida correcta desde el inicio."},
            {"n": "02", "t": "Conecta a una app de aprendizaje", "b": "Simply Piano, Flowkey o similares aceleran el aprendizaje inicial con ejercicios progresivos y feedback inmediato."},
            {"n": "03", "t": "Instala el soporte a la altura correcta", "b": "La altura del soporte es importante para una postura correcta desde el inicio. Ajustalo segun la edad y tamano del nino."},
        ],
        "benefits": [
            {"n": "01", "t": "El instrumento que va a durar anos", "b": "88 teclas y funciones completas para acompañar el aprendizaje desde el inicio hasta niveles avanzados."},
            {"n": "02", "t": "Apps que hacen el aprendizaje mas dinamico", "b": "Los ninos aprenden mejor con feedback inmediato y gamificacion — las apps lo hacen posible."},
            {"n": "03", "t": "Disponibles en PC MIDI Center", "b": "Consulta disponibilidad de los modelos Kressmer para jovenes en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Cuantas teclas necesita un piano para ninos?", "a": "88 teclas es lo correcto desde el inicio. Los pianos mas chicos limitan el repertorio y la tecnica a medida que el nino avanza."},
            {"q": "Que diferencia hay entre el LM-200 y el K-180 para un nino?", "a": "El K-180 tiene 128 tonos, 128 ritmos y 80 demos — mas variado y entretenido para mantener el interes. El LM-200 es mas enfocado en piano puro. Ambos tienen 88 teclas y Bluetooth."},
            {"q": "Las apps de piano son efectivas para ninos?", "a": "Si. Apps como Simply Piano o Flowkey tienen contenido especifico para ninos con ejercicios progresivos y feedback visual en tiempo real."},
            {"q": "Donde puedo ver estas opciones?", "a": "Los modelos Kressmer LM-200 y K-180 estan disponibles en PC MIDI Center — consulta en pcmidi.com.ar."},
        ],
    },
    {
        "slug": "piano-digital-con-bluetooth-apps-aprendizaje",
        "keyword": "piano digital con bluetooth y apps de aprendizaje",
        "intent": "aprender piano con apps como Simply Piano o Flowkey conectadas al instrumento",
        "seo_title": "Piano Digital con Bluetooth para Apps de Aprendizaje | PC MIDI Center",
        "meta_description": "Todos los modelos Kressmer tienen Bluetooth para conectar apps como Simply Piano o Flowkey. Conoce las opciones en PC MIDI Center.",
        "h1": "Piano Digital con Bluetooth para Apps de Aprendizaje: Como Funciona",
        "hero_lede": "La conexion Bluetooth entre el piano y el celular permite que apps como Simply Piano o Flowkey reciban lo que tocas en tiempo real y te den feedback inmediato. Todos los modelos Kressmer lo soportan.",
        "components_title": "Bluetooth dual para apps interactivas en tiempo real.",
        "components_subtitle": "La conexion es simple: encendes el piano, activas el Bluetooth en el celular, abris la app y el instrumento y la pantalla se sincronizan. Sin cables, sin configuracion compleja.",
        "primary_category_id": "pianos-digitales",
        "secondary_category_ids": [],
        "product_ids": ["kressmer-lm-200", "kressmer-lm-103", "kressmer-k-180"],
        "components": [
            {"cat": "Bluetooth dual", "shortCat": "BLUETOOTH", "why": "Permite conectar el piano al celular para apps de aprendizaje y reproducir audio al mismo tiempo.", "look": "LM-200, LM-103 y K-180 tienen Bluetooth dual integrado."},
            {"cat": "Compatibilidad con apps", "shortCat": "APPS", "why": "Simply Piano, Flowkey, Playground Sessions y similares funcionan con conexion Bluetooth o MIDI.", "look": "La conexion Bluetooth es la mas comoda — sin cables y funciona bien con las apps principales."},
            {"cat": "Alternativa USB/MIDI", "shortCat": "MIDI", "why": "Para quienes prefieren conexion por cable, el puerto USB/MIDI ofrece mayor estabilidad.", "look": "Todos los modelos tienen USB y MIDI ademas del Bluetooth."},
        ],
        "steps": [
            {"n": "01", "t": "Activa el Bluetooth en el piano y el celular", "b": "El proceso de sincronizacion es similar al de cualquier dispositivo Bluetooth — simple y rapido."},
            {"n": "02", "t": "Abre la app y selecciona el instrumento", "b": "Apps como Simply Piano detectan el piano automaticamente una vez emparejado con el celular."},
            {"n": "03", "t": "Empieza a practicar con feedback en tiempo real", "b": "La app escucha lo que tocas y te muestra si las notas son correctas, el ritmo y la dinamica."},
        ],
        "benefits": [
            {"n": "01", "t": "Aprendizaje mas rapido con feedback inmediato", "b": "Las apps identifican errores en tiempo real — algo que acelera mucho el aprendizaje inicial."},
            {"n": "02", "t": "Sin cables ni configuracion compleja", "b": "El Bluetooth dual hace que conectar el piano al celular sea tan simple como conectar auriculares inalambricos."},
            {"n": "03", "t": "Disponibles en PC MIDI Center", "b": "Consulta disponibilidad de los modelos Kressmer con Bluetooth en pcmidi.com.ar."},
        ],
        "faqs": [
            {"q": "Funciona Simply Piano con los pianos Kressmer?", "a": "Si. La conexion Bluetooth y USB/MIDI hace que los modelos Kressmer sean compatibles con Simply Piano y las principales apps de aprendizaje."},
            {"q": "El Bluetooth es para audio o para datos MIDI?", "a": "El Bluetooth dual en los Kressmer permite tanto la transmision de datos MIDI (para apps) como la reproduccion de audio desde el celular."},
            {"q": "Conviene Bluetooth o USB para conectar apps?", "a": "Bluetooth es mas comodo para uso diario. USB/MIDI ofrece mayor estabilidad y latencia minima, util si neces mayor precision en el feedback de la app."},
            {"q": "Que app recomiendan para empezar?", "a": "Simply Piano y Flowkey son las mas usadas para principiantes — tienen versiones gratuitas para probar y contenido progresivo bien estructurado."},
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
                        slugs.add(json.loads(line).get("slug", ""))
                    except json.JSONDecodeError:
                        pass
    return slugs


def main() -> None:
    existing = check_existing_slugs()
    new = [p for p in INTENT_LANDINGS if p["slug"] not in existing]

    if not new:
        print("Todas las landings de intencion Kressmer ya existen.")
        return

    with open(LANDINGS_PATH, "a", encoding="utf-8") as f:
        for landing in new:
            f.write(json.dumps(landing, ensure_ascii=False) + "\n")
            print(f"  Agregada: {landing['slug']}")

    print(f"\n{len(new)} landings de intencion agregadas.")
    print("Corre ahora: python build_landings.py build")


if __name__ == "__main__":
    main()
