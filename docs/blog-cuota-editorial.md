# Diseño: intención editorial por cuota (reemplaza la paridad del día)

Estado: decisiones tomadas el 2026-10-20. PR 1 implementado; PR 2 y PR 3 pendientes.

**Decisiones:** la intención se guarda en `preparation.editorialIntent` (JSON, sin migración ni backfill; `null` = paridad de la fecha);
equilibrio de 5 a 9 por tanda de 14 días y máximo 2 seguidos del mismo tipo; el operador puede elegir el tipo a mano siempre, con aviso;
se despliega por PR, con el flag `balanced` apagado hasta confirmar que relay y worker corren la misma versión.
Con JSON, la intención tiene que sobrevivir cuando se reescribe `preparation` (generación, reintento, reemplazo): lo hace `carryIntent`.

## Problema

La intención de cada artículo (`educational` o `decision`) hoy es una función de la fecha:
`(días desde 1970) % 2` → par = educativo, impar = para elegir. Esa regla está
duplicada y repartida en cuatro capas:

| Capa | Dónde | Qué hace con la paridad |
| --- | --- | --- |
| Generación | `build_landings.py:2602` + `editorial_quality.py:21` (copia en Python), `blog-daily.mjs:362`, `business-article-generator.ts:60,71` | Decide qué tipo de artículo se escribe para una fecha |
| Control de calidad | `blog-daily.mjs:175,246`, `blog-recovery.mjs:32`, `blog-launch.mts:36` | Bloquea la publicación (`DATE_INCOMPATIBLE`) si el artículo no coincide con la fecha |
| Movimiento de fechas | `blog-free-slot.mjs` (reprogramar y publicar antes de fecha) | Obliga a mover de a 2 días y arrastra un efecto cascada |
| Interfaz | `week-planner.tsx`, `generate-date-form.tsx`, `calendario/page.tsx`, `actions.ts:89` | Decide qué campos se ofrecen (por ejemplo, el rival solo existe en días "para elegir") |

Consecuencias que ya vimos:
- Un artículo no se puede mover a un día vecino: tiene que ser a un día de la misma paridad.
- Publicar antes de fecha obliga a desplazar el artículo de hoy hasta el próximo día compatible
  (con el calendario de octubre, el artículo del 20 iría al 26, saltando los días ocupados).
- Existe un estado de error propio (`DATE_INCOMPATIBLE`) que solo nace de la regla de paridad.
- El operador no puede pedir "una comparativa mañana" si mañana es un día educativo.
- La regla está escrita dos veces (JS y Python); si divergen, se generan artículos que luego se bloquean.

Lo que se quiere conservar: una mezcla pareja de contenido educativo y de decisión
(hoy `blog-quality.test.ts:47` exige 7 y 7 en cualquier tanda de 14 días).

## Propuesta

La intención deja de ser una función de la fecha y pasa a ser un **dato del slot**.
El equilibrio se mantiene con una **regla de ventana**, no con la paridad.

### 1. Dato

Columna nueva `BlogPublication.editorialIntent` (`String?`, `"educational" | "decision"`).
`null` significa "slot anterior al cambio" y se resuelve con la paridad actual.

Por qué columna y no `preparation`: la generación reemplaza `preparation` completo
(`blog-daily.mjs`, `generationClaim`), así que ahí el dato se perdería. Tampoco se puede filtrar ni
indexar. Es una migración de una columna nullable, de bajo riesgo.

Función única `intentForSlot(slot)` = `slot.editorialIntent ?? paridad(slot.scheduledDate)`.
La versión en Python se elimina: Node pasa `--intent` a `build_landings.py`.

### 2. Asignación (al crear o planificar un slot)

Dónde: la reserva automática de 14 días, `addBlogDays`, `WeekPlanner`, "Nuevo artículo".

Regla `assignIntent(day, vecinos)`, una función pura:
1. Si el operador eligió el tipo (o eligió un rival, que implica `decision`), se respeta.
2. Si no, se elige el tipo menos representado en la ventana de 7 días anteriores y 7 posteriores
   a `day` (contando slots con artículo o con intención ya asignada).
3. Desempate: alternar respecto del día anterior.
4. Tope: nunca más de 2 seguidos del mismo tipo.

Con todo el calendario vacío da el mismo patrón alternado de hoy.

### 3. Equilibrio como aviso, no como bloqueo

- Invariante nueva: en cualquier ventana de 14 días, cada tipo entre 5 y 9 artículos
  (hoy es exactamente 7 y 7), y nunca más de 2 seguidos.
- Si una acción (mover, publicar antes de fecha, reemplazar) la rompe, la interfaz muestra un aviso
  en el panel del día ("Esta semana quedan 5 artículos para elegir y 1 educativo"). No impide la acción.
- Desaparece el estado `DATE_INCOMPATIBLE`: el control de calidad compara el artículo con
  `slot.editorialIntent`, no con la fecha. Las fechas pasan a poder moverse a cualquier día libre.

### 4. Movimiento de fechas

- `nextFreeEditorialDay` pasa a ser "próximo día libre": ya no salta de a 2 ni exige compatibilidad.
  Se conserva la firma para no tocar los llamadores y se retira el parámetro `intent` en una segunda pasada.
- Publicar antes de fecha (`adoptToday`): el artículo de hoy se mueve a la fecha que quedó libre.
  Se acaba el efecto cascada y el 20 → 26.
- Reprogramar: cualquier día futuro libre; el aviso de equilibrio reemplaza el rechazo.

### 5. Interfaz

- Selector "Educativo / Para elegir" por día en "Nuevo artículo" y en el planificador semanal,
  con la sugerencia automática preseleccionada.
- El campo "Rival" aparece según la intención elegida, no según el día. Elegir un rival fija `decision`.
- Panel del día: el tipo sale de `intentForSlot`, con el aviso de equilibrio de la ventana.

## Compatibilidad y despliegue

El riesgo principal son versiones mezcladas: un relay viejo sigue comparando contra la paridad y
marcaría como `DATE_INCOMPATIBLE` un artículo con intención no alineada. Por eso:

1. **PR 1, sin cambio de comportamiento.**
   Migración + backfill con la paridad actual:
   `CASE WHEN (scheduledDate - DATE '1970-01-01') % 2 = 0 THEN 'educational' ELSE 'decision' END`.
   `intentForSlot` en JS, `--intent` en Python, el control de calidad lee `intentForSlot`.
   Como el backfill coincide con la paridad, cualquier proceso viejo sigue funcionando.
2. **PR 2, asignación y movimiento libres, detrás de un flag** por cliente
   (`responsePolicy.blog.intentMode: "parity" | "balanced"`, por defecto `parity`).
   Se activa recién cuando `npm run blog:status` muestra relay y worker en la misma versión.
3. **PR 3, interfaz:** selector por día, avisos de equilibrio y retiro del parámetro `intent` de
   `nextFreeEditorialDay`.

## Pruebas

- Unitarias de `assignIntent` y del chequeo de ventana (incluye propiedad: tandas de 14 días siempre dentro de 5–9).
- Backfill: para fechas de un año, la columna coincide con la paridad.
- Reescribir los tests de `DATE_INCOMPATIBLE` (`blog-daily.test.ts`) y de reprogramación
  (`blog-reschedule-action.test.ts`) para el comportamiento nuevo.
- Prueba de integración del flujo "publicar antes de fecha": el artículo de hoy va a la fecha liberada.

## Qué cambia en cada archivo

PR 1: `prisma/schema.prisma` + migración, `blog-quality.mjs` (`intentForSlot`),
`blog-daily.mjs`, `blog-recovery.mjs`, `blog-launch.mts`, `business-article-generator.ts`,
`build_landings.py` (recibe `--intent`), eliminar `intent_for_date` de `editorial_quality.py`.

PR 2: `blog-free-slot.mjs`, `blog-daily.mjs` (`adoptToday`, reserva de 14 días),
`calendario/actions.ts` (`addBlogDays`, reprogramar, `decisionDay`), módulo nuevo `blog-intent.mjs`
(`assignIntent`, `balanceWarnings`).

PR 3: `week-planner.tsx`, `generate-date-form.tsx`, `calendario/page.tsx`.

## Decisiones que necesito de vos

1. **Columna vs JSON.** Recomiendo la columna (migración de una columna nullable).
   La alternativa sin migración pierde el dato cada vez que se regenera el artículo.
2. **Tolerancia del equilibrio.** Propongo 5–9 por tanda de 14 días y máximo 2 seguidos del mismo
   tipo. Si preferís algo más estricto (6–8) el aviso salta más seguido.
3. **Elección manual del tipo.** Propongo permitirla siempre, con aviso si rompe el equilibrio.
   La alternativa es dejarla solo a la asignación automática.
4. **Orden de despliegue.** Propongo el PR 1 primero y el flag `balanced` apagado hasta confirmar
   que el relay se reinició con el código nuevo.
