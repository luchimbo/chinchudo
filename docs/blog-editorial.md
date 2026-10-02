# Blog editorial de PC MIDI

## Alcance

Los artículos nuevos pasan por un brief y una revisión común de SEO, AEO,
GEO y DEO. Son criterios editoriales y técnicos: no garantizan posiciones,
indexación efectiva, citas ni recomendaciones de asistentes.

La configuración pública de PC MIDI apunta a `https://blog.pcmidicenter.com`.
El calendario y los borradores viven en Supabase; los JSON de reportes son
evidencia operativa, no la fuente de verdad.

## Operación

1. En `/blog/fuentes`, incorporar fuentes revisadas. Cada fuente lleva título,
   tipo, URL o referencia interna, fecha, responsable y afirmaciones respaldadas.
   Las referencias del catálogo y del conocimiento de confianza alta también
   están disponibles. Solo documentar casos y testimonios reales verificados.
2. En `/blog/calendario`, preparar la tanda de 14 días. Se alternan siete
   educativos y siete artículos que ayudan a elegir. Agregar temas y exclusiones.
3. Revisar los artículos desde el editor. Se pueden modificar metadatos,
   respuesta inicial, secciones, FAQ, referencias y comparación. Los motivos de
   bloqueo aparecen agrupados por SEO, AEO, GEO y DEO.
4. Confirmar la revisión de la tanda completa cuando los 14 estén listos.
5. Activar la publicación diaria en `/blog/configuracion`, con hora argentina.
   La primera fecha es el día siguiente, incluidos sábados y domingos.

La automatización comienza apagada. El relay puede preparar contenido privado
con `preparing=true` mientras la publicación sigue apagada. Necesita permanecer
en ejecución; los cambios de código del relay requieren reiniciarlo durante la
puesta en marcha. No se creó una automatización adicional de Codex.

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
