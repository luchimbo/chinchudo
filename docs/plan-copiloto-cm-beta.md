# Plan de desarrollo - Copiloto CM (beta)

## Objetivo

Crear una beta paralela al producto actual para ayudar a un community manager a detectar una oportunidad y llegar a una respuesta publicable en pocos segundos.

La regla principal es simple:

> El sistema piensa. El community manager decide poco.

La beta no reemplaza el sistema existente ni publica automaticamente. Usa las oportunidades, marcas, productos, borradores e historial que ya existen.

---

## Experiencia central

```text
Veo una oportunidad
        |
Elijo que quiero lograr
Responder / Vender / Cuidar
        |
Elijo como quiero sonar
Normal / Con onda / Con cuidado
        |
Recibo tres propuestas
        |
Copio, edito, marco respondida o descarto
```

No hay formularios largos, clasificaciones manuales ni configuraciones obligatorias durante el uso diario.

---

## 1. Crear una seccion nueva y aislada

Nueva seccion dentro de la app: **Copiloto CM (beta)**.

- No modifica ni reemplaza los flujos actuales.
- No publica automaticamente en ninguna red.
- El CM publica manualmente desde la cuenta oficial de la empresa.
- Reutiliza la informacion ya disponible en el sistema.
- Puede activarse solo para clientes o usuarios de prueba.

Resultado: una prueba segura y reversible, sin comprometer la operacion existente.

---

## 2. Simplificar la bandeja de oportunidades

La bandeja tiene solamente tres estados visibles:

- **Para ver**
- **Respondida**
- **Descartada**

Filtros minimos:

- Marca
- Red social
- Estado

El sistema ordena automaticamente por relevancia. La clasificacion avanzada - prioridad, intencion, producto, riesgo o sentimiento - queda en segundo plano como informacion interna, no como una tarea para el CM.

Resultado: el usuario abre la app y sabe rapidamente que revisar.

---

## 3. Mantener solo dos decisiones por oportunidad

Al abrir una oportunidad, el CM decide dos cosas.

### Que quiere lograr

- **Responder**: resolver una duda o aportar una respuesta util.
- **Vender**: orientar hacia un producto, asesoramiento o siguiente paso.
- **Cuidar**: tratar una queja, tema delicado o situacion que requiere prudencia.

### Como quiere sonar

- **Normal**: claro, cercano y natural.
- **Con onda**: con personalidad, picardia o humor leve si corresponde.
- **Con cuidado**: prudente, empatico y sin remates fuera de lugar.

El producto infiere el resto: tipo de consulta, producto relacionado, riesgo, tono recomendado, datos disponibles y pertinencia de coyuntura.

Resultado: una interfaz rapida, sin convertir al CM en operador de un sistema complejo.

---

## 4. Generar tres propuestas claras

El sistema propone solo tres respuestas. No debe llenar la pantalla de variantes similares.

| Propuesta | Funcion |
| --- | --- |
| **Clara** | Responde o resuelve directamente. |
| **Con onda** | Usa una voz mas piola o un remate leve cuando aplica. |
| **Comercial** | Acerca una venta, producto o asesoramiento sin sonar a folleto. |

En oportunidades delicadas, la propuesta **Con onda** se reemplaza automaticamente por una version prudente.

Cada propuesta puede incluir una nota interna breve, solo para orientar al CM:

- "Humor leve viable."
- "No confirmar stock."
- "No conviene usar coyuntura."
- "Requiere revision por posible queja."

Resultado: borradores publicables y entendibles, no texto generico de IA.

---

## 5. Editor rapido

Las acciones principales son:

- **Copiar**
- **Editar**
- **Marcar respondida**
- **Descartar**

Al descartar, el motivo es opcional y se limita a cuatro opciones:

- No era relevante.
- No era el tono.
- No habia suficiente informacion.
- No conviene responder.

Resultado: el CM mantiene control total sin agregar pasos innecesarios.

---

## 6. Usar la marca como inteligencia invisible

La ficha editorial de la marca funciona por detras. Debe alimentar las propuestas sin pedir configuracion constante al usuario.

Incluye:

- Datos reales de productos y servicios.
- Tono y vocabulario de la marca.
- Limites de humor.
- Temas sensibles o prohibidos.
- Respuestas anteriores aprobadas.
- Reglas por red social.

Los perfiles actuales - tecnico, practico, educativo, innovacion y comercial - pasan a actuar como logica editorial interna. El CM no tiene que elegirlos.

Resultado: respuestas consistentes, sin forzar voces artificiales ni agregar decisiones.

---

## 7. Dos radares de contexto

El Copiloto CM no debe inventar actualidad ni usar referencias porque si. Para eso necesita dos radares distintos que alimentan la generacion de respuestas.

| Radar | Pregunta que responde | Ejemplos de fuentes |
| --- | --- | --- |
| **Radar de tendencias** | "De que se esta hablando mucho ahora?" | Google Trends AR, X/Twitter, TikTok Creative Center, hashtags, busquedas por categoria y conversaciones sectoriales. |
| **Radar de coyuntura** | "Que paso, por que importa y se puede usar desde una marca?" | Google News AR, Luzu, Olga, Carajo, Blender, Vorterix y diarios nacionales con curacion editorial. |

No son lo mismo. Un tema puede estar creciendo sin ser apropiado para una marca; una noticia puede ser importante y, justamente por eso, no corresponder para un comentario con humor.

### 7.1 Radar de tendencias

Su trabajo es detectar temas, hashtags, busquedas o conversaciones que estan creciendo en Argentina y en las categorias relevantes para cada cliente.

Fuentes iniciales:

- Google Trends para Argentina.
- TikTok Creative Center para hashtags y tendencias por industria.
- X/Twitter como fuente complementaria de conversacion inmediata, nunca como unica dependencia. Las oportunidades reales detectadas en X se muestran separadas de los trending topics.
- Tendencias por categoria configurables: por ejemplo, para PC MIDI, home studio, controlador MIDI, bateria electronica, DAWs, lanzamientos y competidores.

Cada tendencia debe guardar:

- Tema.
- Fuente.
- Fecha y vigencia.
- Region o industria cuando exista.
- Nivel de crecimiento o relevancia.
- Relacion posible con las marcas o categorias del cliente.

### 7.2 Radar de coyuntura

Su trabajo es transformar hechos actuales en contexto editorial util, no en una lista de titulares.

Fuentes operativas actuales:

- Google News Argentina para noticias relacionadas a cada cliente.
- Agenda reciente de Luzu, Olga, Carajo, Blender y Vorterix.
- Titulares recientes de Clarín, La Nación, Infobae, Perfil, Página/12, Ámbito, El Cronista, C5N y El Destape, conservando el medio de origen.
- Todo ítem de coyuntura se guarda con sensibilidad `needs_review`: se puede abrir, ignorar o usar de forma consciente; nunca se inserta solo en un borrador.

### 7.3 Filtro editorial del Copiloto

El Radar puede ser amplio; el Pulso de hoy no. Antes de mostrar una señal junto a una oportunidad, el sistema evalúa:

- **Frescura:** prioriza señales de las últimas 12 a 36 horas.
- **Pertinencia:** las tendencias y conversaciones pesan más que un titular genérico.
- **Sensibilidad:** política, tragedias, violencia, accidentes, datos económicos y señales marcadas para revisión no habilitan humor.

El Pulso muestra un máximo de cinco señales seguras. Las noticias, los diarios y los datos económicos siguen disponibles en Radar para consulta, pero no se usan para forzar un guiño. Solo una tendencia reciente, segura y relevante puede influir opcionalmente en el modo **Con onda**.

### 7.4 Aprendizaje por cliente

Cada propuesta del Copiloto permite registrar una señal breve: **Sirvió**, **Más directo**, **Menos venta**, **Menos humor**, **Tema sensible** o **No aportó**. Las preferencias explícitas se transforman en reglas de memoria del cliente correspondiente; no se comparten entre clientes. Los casos sin una preferencia durable quedan como feedback operativo, sin convertir una acción aislada en una regla global.

La revisión semanal se hace desde **Aprendizaje IA** por cliente: muestra el volumen y tipo de feedback, las reglas activas y el contexto que estaba seleccionado cuando se recibió cada señal. Cada regla se puede editar o eliminar; no hay cambios masivos ni propagación entre marcas.

Fuentes iniciales:

- Noticias y titulares de fuentes seleccionadas.
- Agenda deportiva, cultural y de entretenimiento.
- Temas, titulos o clips de streamings relevantes: OLGA, Luzu, Blender, Paren la Mano y otros que se definan.
- Curacion editorial minima para marcar sensibilidad y pertinencia de marca.

Cada item se convierte en una ficha simple:

```text
Tema: [nombre]
Que paso: [resumen en dos lineas]
Vigencia: hoy / esta semana / vencido
Sensibilidad: baja / media / alta
Uso de marca: si / con cuidado / no
Por que: [una linea]
```

Ejemplo:

```text
Tema: Final de un reality muy comentado
Vigencia: hoy
Sensibilidad: baja
Uso de marca: con cuidado
Por que: sirve como guino liviano, pero no para respuestas de quejas.
```

Resultado: contexto actual con criterio, sin oportunismo ni memes forzados.

---

## 8. Coyuntura como sugerencia opcional

La coyuntura no es un requisito para responder ni una tarea diaria del CM.

Cuando haya una referencia actual realmente pertinente, el sistema muestra una sugerencia breve:

> Hay una referencia actual que podria funcionar. Queres verla?

El CM puede ignorarla. Si la coyuntura es sensible, vieja o no aporta, no se muestra.

Primera version del modulo:

- Tema y resumen.
- Fuente y fecha.
- Vigencia.
- Sensibilidad: baja, media o alta.
- Recomendacion de uso: si, con cuidado o no.

Resultado: timing cultural util sin oportunismo ni memes forzados.

---

## 9. Aprendizaje automatico

El sistema registra sin pedir trabajo adicional:

```text
Oportunidad
-> Objetivo elegido: responder / vender / cuidar
-> Estilo elegido: normal / con onda / con cuidado
-> Propuestas generadas
-> Edicion humana final
-> Copiada, respondida o descartada
```

Esto permite detectar que voz funciona para cada marca y que tipo de propuesta necesita mas edicion.

---

## 10. Piloto de validacion

Alcance inicial:

- Una marca.
- Una o dos redes sociales.
- Entre 20 y 50 oportunidades reales.
- Publicacion siempre manual.
- Una semana de uso y revision.

Preguntas de validacion:

1. El radar encontro oportunidades utiles?
2. Las respuestas sirvieron como un buen punto de partida?
3. El CM respondio mas rapido?
4. Las respuestas sonaban a la marca?

Si estas cuatro respuestas son positivas, se profundiza la coyuntura y se prepara el producto para mas clientes.

---

## Orden de implementacion

1. Seccion aislada Copiloto CM (beta).
2. Bandeja simple con tres estados.
3. Dos decisiones: objetivo y estilo.
4. Tres propuestas de respuesta.
5. Editor, copia, descarte y registro de uso.
6. Ficha editorial invisible refinada.
7. Radar de tendencias minimo.
8. Radar de coyuntura minimo.
9. Piloto con una marca.
10. Coyuntura avanzada y luego expansion multi-cliente.

La prioridad es validar la experiencia simple antes de sumar complejidad.
