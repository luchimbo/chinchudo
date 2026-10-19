# Idiomas del blog compartido

Todos los clientes usan `/blog`, el calendario y el editor visual existentes.
No hay paneles ni generadores específicos por marca. El enlace antiguo
`/blog/kressmer` redirige al calendario común conservando el cliente.

Al generar un día se elige Español, Inglés o Alemán. La elección se guarda
en `BlogPublication.preparation.language`, sobrevive a reintentos y llega al
mismo generador Python como `--language`. El artículo guarda `language` en
`htmlContent`; el editor muestra ese idioma y conserva el formato habitual.
En Configuración del blog se puede guardar un idioma predeterminado.

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
