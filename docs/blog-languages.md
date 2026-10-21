# Idiomas del blog compartido

Todos los clientes usan `/blog`, el calendario y el editor visual existentes.
No hay paneles ni generadores específicos por marca. El enlace antiguo
`/blog/kressmer` redirige al calendario común conservando el cliente.

Al generar un día se elige Español, Inglés o Alemán. La elección se guarda
en `BlogPublication.preparation.language`, sobrevive a reintentos y llega al
mismo generador Python como `--language`. El artículo guarda `language` en
`htmlContent`; el editor muestra ese idioma y conserva el formato habitual.
En Configuración del blog se puede guardar un idioma predeterminado.

## Cantidad diaria y versiones por idioma

En **Blog → Configuración → Calendario editorial** se eligen entre 1 y 10
temas diarios. Cada tema tiene su propia selección de español, inglés y alemán.
Un tema en los tres idiomas produce tres artículos; dos temas en los tres
idiomas producen seis. El total aparece en el formulario antes de guardar.
El primer idioma seleccionado es el original y las demás versiones se traducen
desde ese mismo artículo, conservando el vínculo `translation_of` y hreflang.
Cada versión se edita desde el editor habitual.

El plan se guarda como `articlePlan` en `blog_daily_schedule:CLIENT_ID`, por
ejemplo `[["en", "es", "de"], ["es"]]` para cuatro artículos diarios sobre dos
temas. Los clientes sin plan conservan un artículo en su idioma predeterminado.
`BlogPublication.dailySlot` identifica cada tema dentro de la fecha. Las
traducciones acompañan su fecha, aprobación y publicación. Antes del despliegue
se comprueba que existan todas las versiones y que pasen los controles de calidad.
Una traducción fallida se reintenta hasta tres veces; después se informa el error
y se puede volver a solicitar desde el editor del original.

Los cambios afectan reservas automáticas que todavía no empezaron. Los artículos
preparados y las fechas manuales se conservan. Cambiar el plan no activa la
publicación automática ni modifica la aprobación manual.

Aplicar primero `prisma migrate deploy` y regenerar Prisma, luego desplegar la
app y reiniciar ambos trabajadores (`agent-relay` y `blog-runtime-service`).
Para preconfigurar Kressmer sin activar publicación:

```powershell
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/configure-blog-daily-plan.mts --client kressmer --languages en,es,de --topics 1 --dry-run
node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/configure-blog-daily-plan.mts --client kressmer --languages en,es,de --topics 1 --apply
```

El comando guarda un reporte con respaldo de la configuración anterior.

La configuración por cliente vive en `Client.responsePolicy.blog`:

```json
{
  "calendar": true,
  "language": "en",
  "languages": ["en", "de"],
  "deployment": {"projectId": "ID_DEL_PROYECTO", "orgId": "ID_DEL_EQUIPO", "projectName": "NOMBRE_DEL_PROYECTO"}
}
```

La marca, colores, logo y plantilla usan los campos de diseño ya existentes.
Cada cliente despliega en su proyecto configurado y compila en un directorio
aislado. Los idiomas EN/DE tienen portada y rutas propias; español conserva
las URLs existentes. La publicación usa los mismos controles, reserva por
cliente y verificación de la revisión pública del calendario original.

## Trabajador compartido

`npm run blog:runtime` inicia el trabajador común en el puerto 3102 con túnel
cloudflared. Se autentica con `AGENT_RELAY_TOKEN`; publica su URL vigente en
`blog_runtime_relay_url`. Reutiliza `createBlogDaily` para cada cliente cuyo
calendario esté habilitado. El relay original sigue operando el piloto existente.
Ambos comparten la reserva de base de datos y no ejecutan simultáneamente
el blog de un mismo cliente.

El equipo local y el trabajador deben permanecer encendidos para preparar y
publicar. No se activa publicación automática por crear o migrar un cliente.

## Conversión de borradores anteriores

`node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/migrate-blog-languages.mts --client SLUG --dry-run`

`--apply` convierte borradores con el formato anterior `translations` en
artículos editoriales normales, uno por idioma, y conserva respaldo en reports.
No publica contenido. La cuenta y el dominio no se vuelven a crear.
