# Análisis inicial del negocio

El onboarding y `/geo` comparten un perfil por cliente. El análisis aplica la descripción, oferta, público, catálogo, prioridades, diferenciales y exclusiones al contexto de respuestas, escucha y contenido. Las correcciones humanas tienen prioridad. Los clientes existentes pueden iniciar el análisis desde `/geo`; no se les exige repetir el onboarding.

## Operación

1. En el onboarding, ingresar la web y el mercado, o completar los datos manualmente. Se puede continuar cuando el perfil está disponible mientras se comparan competidores y se preparan artículos.
2. En `/geo`, usar **Mi negocio** para corregir el perfil, ordenar prioridades, excluir temas y configurar la actualización mensual. El enlace de catálogo abre el editor de productos y servicios del onboarding.
3. En **Competidores**, revisar hasta cinco candidatos y sus fuentes. Quitar un dominio conserva una exclusión permanente; restaurarlo es una decisión explícita.
4. En **SEO y oportunidades**, consultar cobertura, páginas examinadas, evidencia y recomendaciones. Los públicos sugeridos y las oportunidades de contenido son interpretaciones. La muestra no demuestra ausencia de productos, tráfico, rankings, autoridad o backlinks.
5. Revisar los artículos desde el editor o **Borradores** en `/blog`. El calendario está disponible para todos los clientes. La acción **Aprobar borrador** del calendario verifica la calidad antes de levantar el bloqueo de revisión.

Cada semana abarca siete fechas consecutivas desde el día local de inicio de la corrida. Las fechas ocupadas se conservan y no se desplazan las nuevas fechas fuera de esa semana. La deduplicación usa las búsquedas existentes del cliente y las exclusiones. Si no hay suficientes temas respaldados, quedan días pendientes; **Reintentar pendientes** conserva artículos terminados y fechas omitidas por el operador.

Los artículos nuevos se guardan como `DRAFT`, con `generation_mode: private-draft`, sin URL pública ni despliegue. Las reservas llevan `requiresApproval: true`. La publicación automática existente no procesa estos borradores antes de su aprobación humana. Editar, reemplazar o reprogramar un artículo del análisis vuelve a exigir revisión. Los enlaces públicos de landings tampoco sirven artículos programados sin publicar.

El análisis automático conserva precios, stock y disponibilidad existentes. Una oferta conocida que no aparece en una nueva lectura se mantiene con una advertencia para confirmar su vigencia.

Las ofertas no observadas que se conservan para revisión no se reimportan al catálogo
como si fueran una lectura reciente. El guardado del perfil y su catálogo admite
hasta 120 segundos para las escrituras en la base remota; la lectura web y la IA
se ejecutan fuera de esa transacción.

## Instalación y worker local

La migración aditiva es `prisma/migrations/20261005_business_analysis/migration.sql`. Crea `BusinessProfile`, `BusinessCompetitor` y `BusinessAnalysisRun`, y amplía `BlogPublication`. No borra tablas ni modifica reservas anteriores. Las tablas nuevas usan RLS, sin permisos para `anon`, `authenticated` ni `PUBLIC`; la API opera desde el servidor y valida acceso por cliente.

```powershell
node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate
```

En esta implementación la migración ya se aplicó a la base configurada. En Windows, si otro proceso mantiene abierto el motor de Prisma, `generate` puede devolver `EPERM` al reemplazar su DLL. Cerrar ese proceso y repetir la generación en una ventana de mantenimiento. El build directo de Next sirve para verificar compilación usando el cliente generado disponible.

El relay existente agenda el worker cada minuto, con una sola ejecución local simultánea. **Un relay que estaba abierto antes de la actualización necesita reiniciarse para cargar este intervalo.** El inicio normal de la suite continúa usando `npm run relay:start`.

Configurar `SEARXNG_URL` en el entorno del relay; su valor por defecto es `http://127.0.0.1:8080`. SearXNG debe habilitar el formato JSON. El worker consulta `GET /search` con `q`, `format=json` y `language`, según su [API oficial](https://docs.searxng.org/dev/search_api.html). Si no está disponible, el análisis propio continúa y se pueden agregar dominios manualmente.

Comandos directos para conservar los argumentos en PowerShell:

```powershell
# Inspección: no crea perfiles, reservas, artículos ni reportes en disco.
node node_modules/tsx/dist/cli.mjs scripts/business-analysis-worker.mts --dry-run

# Procesar únicamente corridas en cola y actualizaciones vencidas.
node node_modules/tsx/dist/cli.mjs scripts/business-analysis-worker.mts --scheduled

# Iniciar voluntariamente para un cliente y procesar su cola.
node node_modules/tsx/dist/cli.mjs scripts/business-analysis-worker.mts --client pcmidi
```

La fuente de verdad es Postgres. Una restricción parcial permite una sola corrida `QUEUED` o `RUNNING` por cliente. El worker usa leases con renovación, checkpoints recuperables y hasta tres intentos antes de dejar una tarea pendiente. Un worker interrumpido puede retomarse al vencer su lease. Los resultados guardan páginas leídas, descartes, cambios con valores anteriores y nuevos, una copia del perfil aplicado, artículos creados, días pendientes y errores. Las ejecuciones con actividad también generan `reports/business-analysis-*.json`.

La próxima actualización se programa un mes calendario después del último perfil analizado con éxito, usando su zona horaria y ajustando al último día del mes cuando corresponde. Los fallos conservan el último perfil válido. Una actualización prepara otra semana desde su propia fecha de inicio, siempre bajo revisión humana.

## Interfaces y límites

- `/api/business-analysis`: `GET` devuelve perfil, competidores, corridas y reservas; `POST` inicia o reintenta y devuelve `202` con el identificador; `PATCH` corrige perfil, competidores o actualización mensual.
- Mercado inicial: Argentina, español latinoamericano, alcance nacional y `America/Argentina/Buenos_Aires`; editable.
- Lectura: hasta 40 páginas propias y 20 por competidor, con límites de tiempo y tamaño. Una cobertura parcial queda explícita.
- Protección de URLs: solo HTTP(S) público, sin credenciales; validación DNS, direcciones privadas bloqueadas y revisión de redirecciones con conexión fijada a la dirección validada.
- IA: usa el proveedor configurado y la clave por cliente con su fallback existente. No crea artículos determinísticos cuando falla la IA; conserva pendientes para reintentar.
- Fuera de alcance: auditoría de compra, condiciones comerciales, nuevas integraciones, facturación y campañas de backlinks.

## Verificación

Vitest cubre productos, servicios y oferta mixta; fallos de sitios/IA; resultados parciales; ausencia de competidores; correcciones, exclusiones y aislamiento; URLs privadas; siete fechas, cruces de mes, ocupación, deduplicación, reintentos y generación privada incluso con publicación automática habilitada.

```powershell
node node_modules/vitest/vitest.mjs run
python -m pytest agents/tests landing-build/tests -q
node node_modules/next/dist/bin/next lint
node node_modules/next/dist/bin/next build
node node_modules/tsx/dist/cli.mjs scripts/verify-business-analysis.mts
```

El último comando verifica perfil, reservas privadas y correcciones en una transacción real que se revierte por completo; no llama IA ni publica. También se verificaron RLS, permisos y la restricción de una corrida activa mediante una prueba transaccional con rollback. El recorrido de interfaz se comprobó con Playwright y respuestas simuladas: registro → onboarding → corrección → activación local → panel → competidores → SEO → editor, incluyendo pantalla móvil. No sustituye una prueba con un proveedor de IA y SearXNG reales.
