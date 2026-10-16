# Blog editorial de PC MIDI

## Alcance

Los artículos nuevos pasan por un brief y una revisión común de SEO, AEO,
GEO y DEO. Son criterios editoriales y técnicos: no garantizan posiciones,
indexación efectiva, citas ni recomendaciones de asistentes.

La configuración pública de PC MIDI apunta a `https://blog.pcmidicenter.com`.
El calendario y los borradores viven en Supabase; los JSON de reportes son
evidencia operativa, no la fuente de verdad.

## Operación

La entrada `/blog` abre el calendario mensual. El listado y sus filtros viven
en `/blog/articulos`; los enlaces anteriores `/blog?status=...` redirigen al
listado conservando el cliente y el filtro. Cada día muestra título y estado;
al seleccionarlo se abre el detalle con vista previa, edición, acciones y
resultados. El mes y el día se conservan en la URL y al volver del editor.
Fuentes, Diseño y Configuración están agrupados en **Herramientas**. Contactos
mantiene su entrada propia. **Agregar días** conserva la preparación al final
del calendario y la política de publicación existente.

En PC MIDI, cualquier día vacío posterior a hoy ofrece **Generar artículo**,
incluso fuera del horizonte de 14 días. Se reserva la fecha exacta de forma
atómica y el agente existente prepara el contenido en segundo plano, conservando
la alternancia editorial, la revisión de calidad y la política de aprobación.
El detalle se actualiza durante la preparación. Hoy y los días pasados no
ofrecen esta acción; una fecha ocupada nunca se sobrescribe.

La solicitud aceptada cierra el detalle y se sigue desde **Tareas del blog**,
junto con las publicaciones. `GET /api/blog/jobs` consulta únicamente tareas
del cliente autenticado; la consulta anterior de publicaciones sigue compatible.
Se guardan los identificadores en la sesión de la pestaña para recuperar el
seguimiento al recargar. El sondeo es serial: cinco segundos mientras hay
tareas y veinte cuando no hay actividad. Un cambio de etapa refresca el panel.

La migración `20261014_blog_preparation` añade `preparation` y `errorCode` a
`BlogPublication`. No modifica sus estados ni la programación diaria. Las etapas
son **En espera**, **Generando** y **Revisando calidad**, informadas por el
trabajador real. El generador Python transmite eventos con el identificador
del intento; la persistencia rechaza resultados de intentos reemplazados o
finalizados. Los trabajos que superan su límite se recuperan bajo la reserva
del cliente. Los borradores del análisis mantienen su requisito de aprobación.

Los errores nuevos distinguen conexión, generación, calidad, fecha incompatible
y despliegue. Cada uno ofrece su acción permitida; el texto técnico se despliega
aparte. Un error antiguo sin código conserva **Ver detalle**. Una corrección
que pasa calidad limpia el bloqueo; una publicación solo termina al verificarse
la versión pública.

El catálogo distingue incidencias abiertas de evidencia histórica. Los retiros
de fichas antiguas también requieren dos fechas independientes; la recuperación
puede usar recorridos completos anteriores ya verificados, sin contar otra vez
el mismo día. Una URL antigua sin ficha ni uso en artículos se conserva como
referencia histórica después de confirmar su ausencia. Las vinculaciones
ambiguas muestran la ficha entrante y los candidatos; elegir un candidato no
escribe nada hasta pulsar **Vincular**. La resolución se vuelve a verificar contra
la tienda y queda pendiente hasta confirmar el despliegue del blog.

El ciclo del catálogo comprueba si hay trabajo antes de tomar la reserva
compartida del blog, y vuelve a comprobarlo bajo esa reserva. Una consulta
programada sin trabajo no bloquea la generación. El estado técnico del
trabajador puede comprobarse desde `/health`, sin exponer errores ni credenciales.

La navegación de Blog muestra progreso inmediatamente, incluidos los cambios de
mes, filtros y apertura de días. El detalle tiene un esqueleto propio durante
la carga; las acciones conservan sus indicadores y bloquean envíos duplicados.
La preparación usa una barra indeterminada y respeta la preferencia de reducir
movimiento. El calendario se muestra sin esperar el chequeo del agente local,
que se consulta por separado. El listado pide solo los campos visibles y carga
sus consultas independientes en paralelo.

Al aceptar una publicación manual, el detalle se cierra automáticamente y un
aviso con barra indeterminada acompaña al operador por la app. El seguimiento
consulta el estado real de `BlogPublication` y se recupera al recargar la misma
pestaña. No calcula porcentajes por tiempo ni inicia nuevas publicaciones al
consultar el estado. Solo ofrece **Ver artículo** después de `PUBLISHED`, cuando
el trabajador ya verificó la revisión en la URL pública. Los fallos conservan
su motivo y los cortes de conexión se reintentan sin anunciar un éxito falso.

1. En `/blog/fuentes`, incorporar fuentes revisadas. Cada fuente lleva título,
   tipo, URL o referencia interna, fecha, responsable y afirmaciones respaldadas.
   Las referencias del catálogo y del conocimiento de confianza alta también
   están disponibles. Solo documentar casos y testimonios reales verificados.
2. En `/blog/calendario`, preparar la tanda de 14 días. Se alternan siete
   educativos y siete artículos que ayudan a elegir. Agregar temas y exclusiones.
3. Revisar los artículos desde el editor. Se pueden modificar metadatos,
   respuesta inicial, secciones, FAQ, referencias y comparación. Los motivos de
   bloqueo aparecen agrupados por SEO, AEO, GEO y DEO.
   Al generar y guardar, el sistema enlaza las menciones del catálogo, cita
   las fichas usadas y agrega una guía publicada cuando hay coincidencia de
   tema. Los borradores anteriores se pueden completar y guardar en un clic.
   Las URLs examinadas se conservan como investigación; no se convierten en
   evidencia revisada por haber sido visitadas. Si faltan destinos o fuentes
   pertinentes, la revisión conserva el pendiente sin inventarlos.
4. Confirmar la revisión de la tanda completa cuando los 14 estén listos.
5. Activar la publicación diaria en `/blog/configuracion`, con hora argentina.
   La primera fecha es el día siguiente, incluidos sábados y domingos.

La automatización comienza apagada. El relay puede preparar contenido privado
con `preparing=true` mientras la publicación sigue apagada. Necesita permanecer
en ejecución; los cambios de código del relay requieren reiniciarlo durante la
puesta en marcha. No se creó una automatización adicional de Codex.

### Publicación automática de PC MIDI

La opción **Aprobar artículos automáticamente** pertenece exclusivamente a
`blog_daily_schedule:<clientId>.autoApprove` y comienza en `false`. No cambia
`Client.autoApprove` ni `Client.autoPublish`, utilizados por otros flujos.
Con publicación diaria activa, el relay revisa también los borradores del
análisis comercial. Solo aprueba contenido con evidencia válida, sin duplicados
y con intención editorial compatible con su fecha. Los bloqueados conservan
la aprobación pendiente y el motivo del error. Al publicar se repite la revisión.

La puesta en marcha acordada es un artículo diario a las **12:00 de Argentina**,
incluidos fines de semana, desde el día siguiente a la activación. El panel
muestra la conexión del agente, el próximo artículo, borradores y bloqueos.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/blog-launch.mts --dry-run
node node_modules/tsx/dist/cli.mjs scripts/blog-launch.mts --recover
node node_modules/tsx/dist/cli.mjs scripts/blog-launch.mts --activate
```

La recuperación revalida artículos vencidos (incluido el día de activación),
conserva sus identificadores y los mueve a fechas libres del mismo tipo.
Una repetición no vuelve a mover los recuperados. No toca artículos publicados,
archivados ni omisiones sin artículo. Los bloqueados quedan para revisión.
`--activate` recupera primero y exige un artículo apto para mañana, sitio y relay
disponibles y un despliegue verificado del catálogo. Guarda la configuración
anterior y el resultado en `reports/blog-launch-*.json`. Repetirlo con la
automatización activa conserva la primera fecha. Nunca publica en bloque.

Después de cambiar el relay, reiniciar la tarea **PCMidi Relay** y comprobar
`/health`: debe responder `blogAutomationVersion: 2`. El equipo debe permanecer
encendido y conectado para publicar. Una sincronización `PARTIAL` puede tener
un despliegue verificado: las URLs 404 y vinculaciones ambiguas se conservan
como pendientes de catálogo, sin aprobar artículos ni inventar reemplazos.

Las fechas se pueden omitir, reemplazar o reprogramar. Al mover un artículo se
elige una fecha del mismo tipo para conservar el equilibrio. Las fechas pasadas
sin publicación se omiten; los artículos pendientes se pueden reprogramar.
Los errores de generación sin artículo permiten reintentar la preparación.

## Evidencia y publicación

- El modelo solo recibe los productos permitidos y las fuentes del brief.
- Las referencias desconocidas, datos sensibles sin afirmación explícita,
  testimonios ficticios y búsquedas duplicadas bloquean la publicación.
- Si hay tiempo, el generador intenta una corrección con la misma evidencia.
  La revisión vuelve a ejecutarse; nunca se levanta el bloqueo por un reintento.
- Las reglas automáticas son conservadoras y no sustituyen la lectura editorial.
  Las fichas incompletas requieren documentación adicional o quitar el dato.
- Los borradores no forman parte del sitio público ni del sitemap. La vista
  previa autenticada lleva `noindex`.
- El contenido del artículo es visible sin JavaScript, también dentro de la
  vista previa privada. La cabecera es compacta y el logo monocromático de PC
  MIDI se presenta en blanco sobre fondo oscuro; los demás clientes conservan
  los colores de sus logos. Los cambios de plantilla se ven al volver a abrir
  la vista previa; el sitio público los incorpora en el siguiente despliegue.
- La publicación necesita despliegue correcto y comprobación del identificador
  de esa versión en la URL pública; un HTTP 200 de la versión anterior no basta.
- Una edición publicada conserva el slug y la URL. La versión anterior se
  conserva hasta el despliegue verificado; los errores se muestran y se reintentan
  hasta tres veces. Guardar una nueva revisión restablece los intentos.
- Se muestran fuentes y comparativas cuando corresponden, con `BlogPosting`,
  organización y breadcrumbs. El artículo editorial no genera `FAQPage`.

Las estadísticas son visitas registradas, clics a la tienda y contactos. La
procedencia solo se identifica si el navegador entrega una referencia. Un
artículo publicado y apto para indexación no se presenta como indexado en Google.
Search Console y campañas de menciones independientes quedan para otra etapa.

## Comandos

```powershell
npx prisma migrate deploy
node scripts/blog-prepare.mjs --dry-run
node scripts/blog-prepare.mjs --prepare --starter-topics
node scripts/blog-prepare.mjs --generate
node scripts/agent-relay.mjs
npm run test
python -m pytest landing-build/tests/test_editorial_blog.py -q
npx tsc --noEmit
npx next build
```

La preparación CLI nunca publica ni activa la automatización. El generador de
PC MIDI en producción exige `--schedule-date`; la regeneración directa de
artículos publicados se realiza desde el editor con despliegue pendiente.
El runtime Python prefiere `AGENTS_PYTHON_BIN`, luego `.venv`, y necesita las
dependencias de PostgreSQL del proyecto. Cada corrida deja un reporte en
`reports/` o `landing-build/reports/`.

Las solicitudes editoriales tienen un límite de salida (`BLOG_LLM_MAX_TOKENS`,
8000 por defecto). Para el modelo configurado `deepseek/deepseek-v4-flash` se
desactiva el razonamiento alto por defecto para respetar el tiempo de generación;
se puede configurar `BLOG_LLM_REASONING_ENABLED=true` para habilitarlo.
En otros modelos se conserva el comportamiento del proveedor, salvo configuración
explícita de esa variable. La cancelación termina también los descendientes del
proceso Python de esa corrida en Windows.
