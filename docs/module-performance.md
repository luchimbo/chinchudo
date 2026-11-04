# Rendimiento de Blog y Asistente CM

## Activación

La entrega mantiene Next.js 14, Prisma 5 y Postgres. No requiere Redis.
Aplicar en este orden en cada entorno nuevo:

1. `npx prisma migrate deploy`.
2. `npm run blog:backfill-metadata -- --dry-run` y después `npm run blog:backfill-metadata`.
3. `npx tsx scripts/verify-module-performance.mts`: comprobar metadatos, aislamiento y restricciones de tareas.
4. Arrancar `npm run agents:cm-manual` en la computadora que ejecuta los agentes.
   Si ya estaba funcionando, reiniciarlo después de actualizar el código.
5. Activar las variables y reiniciar la aplicación:

```env
OPTIMIZED_LOADING="true"
CM_MANUAL_QUEUE="true"
BLOG_INDEXED_METADATA="true"
```

`BLOG_INDEXED_METADATA` se activa solamente después de un backfill sin errores ni conflictos.
La migración es aditiva: conserva el contenido JSON y las respuestas anteriores.

En Windows, `npm run agents:cm-manual:install` intenta registrar una tarea al iniciar
sesión. Si Windows deniega ese registro, el instalador usa un acceso directo en
Inicio del usuario. También se puede ejecutar el worker directamente con Node/tsx.
Los registros están en `reports/cm-manual-worker.log` y `.err.log` cuando se usa
el lanzador de Windows. Evitar arrancar copias adicionales innecesarias.

## Cambios operativos

- Asistente CM carga 20 oportunidades y sus propuestas principales. Las conversaciones
  y variantes se recuperan al abrirlas. Las búsquedas de productos y enlaces tienen
  páginas de 20 resultados y un debounce de 250 ms.
- Los resúmenes de cobertura se almacenan por cliente en `CMCoverageSnapshot`;
  envían estados solo de las 20 tarjetas visibles. Un cambio de estado no descarga
  nuevamente todas las conversaciones; solo se pide detalle cuando cambia una
  propuesta. Son indicadores, nunca autorización para generar, guardar o publicar.
  La caducidad es de 30 segundos y los cambios de contexto invalidan los resúmenes.
- Calendario separa grilla, resultados y comprobación de conexión. Esta última
  consulta al agente después de cargar la pantalla.
- El editor pesado se carga dinámicamente. Guardar o actualizar traducciones
  utiliza el resultado de la operación y su panel de estado sin recargar el editor.
- Los sondeos esperan a que termine la petición anterior, se pausan con la pestaña
  oculta y aumentan la espera tras errores. Cadencia normal: 3 s con trabajo y 20 s
  en reposo.
- La conexión Prisma se comparte entre bundles del mismo proceso. La sesión y
  autorización se comprueban por petición; no hay una caché global de permisos.
- Usuario, cliente y estado de onboarding se resuelven juntos y se reutilizan
  únicamente durante la petición. Se mantienen los flujos de soporte delegado.

## Cola manual

`POST /api/cm/jobs` recibe `client`, `opportunityId`, `action` (`generate` o
`regenerate`), `idempotencyKey` UUID y, opcionalmente, `responseId`, `productId` y
`chatHistory`. Devuelve HTTP 202 con `{ id, status }` después de persistir la tarea.
`GET /api/cm/jobs?client=...` permite retomar tareas; `id` limita la consulta.
Todas las lecturas se restringen al cliente autorizado y usan `private, no-store`.

Para sesiones de usuario, la admisión rápida verifica la firma y expiración del JWT
y después comprueba usuario vigente, `tokenVersion`, cliente activo y pertenencia
de los recursos en la misma sentencia que crea la solicitud. El JWT por sí solo
no autoriza el INSERT. Las sesiones delegadas conservan los guards existentes.

Estados: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CONFLICT`.
Los índices únicos impiden dos solicitudes activas para una oportunidad y dos
ejecuciones manuales para el mismo cliente. Un bloqueo transaccional limita las
ejecuciones manuales a dos globales. Se comparte el lease de `DraftJob` con los
procesos existentes; un worker sin dueño vigente no puede guardar el resultado.

La huella de entrada se comprueba antes de generar y se revisan nuevamente el
contexto, la oportunidad y sus respuestas antes de guardar. Los cambios concurrentes
terminan en conflicto. El guardado de propuesta y éxito de tarea es atómico.
La huella de admisión incluye las fuentes del contexto, las reglas y la configuración
del modelo: también detecta cambios ocurridos mientras la solicitud estaba en cola.
Las ediciones y aprobaciones humanas se conservan; una propuesta nueva se muestra
para revisar. Las ediciones locales del operador tampoco se reemplazan al terminar
una tarea en segundo plano.

Aplicar o publicar una propuesta comprueba su versión directamente contra las
fuentes. Una respuesta antigua sin versión verificable necesita una propuesta
nueva; sus ediciones y aprobaciones anteriores permanecen guardadas. El cálculo
global de cobertura se conserva. Para comprobar una aprobación se puede excluir
solo el ejemplo y las memorias derivados de esa misma respuesta: su propio
aprendizaje no invalida la revisión; otros cambios de catálogo o contexto sí.

Antes de publicar se guarda un intento en la oportunidad. Un timeout, error 5xx,
confirmación sin ID o fallo de persistencia posterior conserva el bloqueo de otro
envío. El operador debe revisar YouTube: si ya se publicó, puede guardarla como
respondida; si no se publicó, confirma la comprobación y habilita otro intento.
No se reenvía automáticamente. Cada intento tiene un identificador que impide
que la respuesta tardía de un intento anterior desbloquee el siguiente.
Mientras un envío puede seguir en curso, el desbloqueo espera hasta dos minutos;
una respuesta explícitamente ambigua permite la comprobación inmediatamente.

Los leases manuales vencen a los dos minutos y se renuevan durante el trabajo.
Solo se reintentan errores transitorios, hasta tres intentos. Una cola vacía no
abre una transacción en cada sondeo. El heartbeat indica si el procesador está
disponible. La cola no tiene ninguna acción de publicación.

## Idiomas y compatibilidad

`Landing.language` y `Landing.translationOfId` tienen índices por cliente.
Un trigger deriva ambos campos del JSON en cualquier escritura, incluidas las
escrituras SQL de Python. Rechaza originales de otro cliente y autorreferencias.
El backfill usa lotes y versiones esperadas para no pisar ediciones concurrentes.

Los lectores antiguos del JSON siguen funcionando al desactivar el flag de
metadatos. No se debe retirar el trigger mientras existan escritores antiguos.

## Verificación y mediciones

```powershell
npm test
npm run lint
npx tsc --noEmit
npm run build
npx tsx scripts/verify-cm-fast-admission.mts
npx tsx scripts/verify-cm-worker.mts
npx tsx scripts/verify-cm-worker.mts --expired-lease
npx tsx scripts/verify-cm-publication-guard.mts
```

`verify-cm-fast-admission` revierte su transacción de prueba. Las verificaciones
de worker/admisión usan exclusivamente registros desechables, los eliminan por
sus IDs y no publican ni invocan modelos externos.

Para UI se utiliza `scripts/verify-module-ui.mts`, con Playwright instalado en
`.tmp/browser-check` y un Chromium local indicado por `PERFORMANCE_CHROMIUM`.
`PERFORMANCE_BASE` debe apuntar a un servidor de prueba localhost. Las pruebas
esperan controles utilizables; no esperan inactividad total de una página que
consulta estados periódicamente.

`scripts/compare-module-performance.mts` alterna antes/después y envía una sola
petición HTTP por vez: un calentamiento y 30 muestras por pantalla principal de PC MIDI. Para los otros
clientes, `PERFORMANCE_OTHER_SAMPLES` permite una línea base más breve, que se
marca como preliminar cuando tiene menos de 30 muestras. Sin esa variable se
toman 30 muestras por pantalla y cliente.
Registra respuesta completa, TTFB, tamaño y códigos HTTP; rechaza respuestas de
error en vez de contarlas como cargas rápidas. El JSON se guarda en
`reports/module-performance-comparison.json`.

Las mediciones históricas que ejecutaban varios benchmarks y UI simultáneamente
no se deben mezclar con la comparación pareada. La base es compartida y operativa;
los resultados corresponden al entorno local de producción contra esa base,
no certifican la latencia del despliegue público ni la del proveedor de IA.

La prueba separada `scripts/benchmark-cm-admission.mts` registra 30 solicitudes
nuevas después del calentamiento. Su informe distingue p50 y p95: no equiparar
un primer pedido frío con el p95 de pedidos calientes.

## Reversión

Desactivar primero `CM_MANUAL_QUEUE` para detener nuevas solicitudes. Se pueden
dejar terminar las aceptadas o detener el worker y permitir su recuperación por
lease después del reinicio. Desactivar `OPTIMIZED_LOADING` recupera los lectores
y el flujo anteriores. `BLOG_INDEXED_METADATA=false` recupera las búsquedas JSON.
Reiniciar la app para aplicar los flags.

Conservar tablas, columnas, tareas y metadatos durante la reversión. No requiere
una migración destructiva. Eliminar el acceso directo de Inicio solamente si se
quiere desinstalar el arranque automático del worker.
