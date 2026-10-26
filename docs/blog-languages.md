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

Los idiomas del plan también se aplican a los borradores existentes del calendario
activo. Se conservan el original, su idioma y las fechas; solo se completan las
versiones faltantes. Cambiar el plan no activa la publicación automática ni
modifica la aprobación manual. Cada URL se verifica con la revisión desplegada
antes de marcar la publicación como completada.

### Recuperación de notas vencidas

Revisar primero la selección, sin modificar datos:

```powershell
node --env-file=.env scripts/recover-blog-publications.mjs --client kressmer --dry-run
```

Para preparar y publicar las notas válidas, conservando sus fechas originales:

```powershell
node --env-file=.env scripts/recover-blog-publications.mjs --client kressmer --apply --publish
```

El comando comparte la reserva del publicador, guarda un respaldo y un reporte
en `reports/`, archiva traducciones duplicadas no publicadas y completa ES/EN/DE.
No recupera omisiones deliberadas ni evita aprobaciones o controles de calidad.
Sin `--publish` solo prepara la recuperación; el calendario activo podrá publicarla
en su siguiente ejecución a partir de la hora configurada. Repetir el comando no
republica artículos completados. La opción guardada `catchUpMissed: true` permite
recuperar automáticamente futuras notas vencidas después de una interrupción del
servicio. El equipo debe estar encendido; al volver a arrancar se procesa lo pendiente.

El trabajador depura automáticamente traducciones repetidas no publicadas y
conserva un registro de la copia archivada. Los títulos, palabras clave,
descripciones y temas similares son avisos informativos: no bloquean el build
ni la generación editorial. Si una URL ya existe, el generador agrega un sufijo.
Los fallos técnicos y traducciones que agotaron sus tres intentos vuelven a la
cola automáticamente: primero a los 15 minutos y luego con espera creciente,
hasta un máximo de seis horas. La recuperación guarda el error previo y la
próxima hora de reintento en `preparation.automaticRecovery`, conserva las fechas
y respeta la aprobación humana. Un bloqueo editorial se revisa otra vez y solo
se levanta cuando la validación vigente lo permite.

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
