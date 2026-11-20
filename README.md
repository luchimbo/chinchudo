# Los 5 Apóstoles

Dashboard interno para inteligencia comercial, social listening y respuestas asistidas por IA — PC MIDI Center.

## Stack

- **Next.js 14** + TypeScript + Tailwind CSS
- **Prisma ORM** → **Supabase Postgres** (producción)
- **OpenRouter** (DeepSeek / Gemini) para generación de borradores y resúmenes
- **Python + CDP** para monitoreo semi-automático de redes

## Setup inicial (desarrollo)

```bash
npm install
cp .env.example .env
# Completar DATABASE_URL, DIRECT_URL, OPENROUTER_API_KEY y AUTH_SECRET en .env
npx prisma db push
npm run db:seed
npm run dev
```

La app queda en `http://localhost:3000`. El login requiere la contraseña definida en `AUTH_SECRET`.

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | URL pooled de Supabase (puerto 5432 Transaction mode) |
| `DIRECT_URL` | URL directa de Supabase (puerto 5432 Session mode) |
| `OPENROUTER_API_KEY` | API key de OpenRouter |
| `OPENROUTER_MODEL` | Modelo a usar (default: `google/gemini-2.0-flash-lite`) |
| `AUTH_SECRET` | Secreto para firmar el JWT de sesión del dashboard |

###Usuarios por cliente

Los usuarios con contrasena viven en la base de datos (tabla `users`), creados con `npm run db:seed`. El login pide email y contrasena.

`admin` ve todos los clientes activos. `operator` solo ve su cliente asignado.

## Scripts

```bash
npm run dev           # Servidor de desarrollo
npm run build         # Build de producción
npm run lint          # ESLint
npm run test          # Tests unitarios (Vitest)
npm run db:push       # Sincronizar schema Prisma → Supabase
npm run db:seed       # Cargar datos iniciales
npm run db:studio     # Prisma Studio (explorador visual de DB)
```

### Migraciones de una base Supabase existente

El repositorio incluye el baseline PostgreSQL `prisma/migrations/0_init`. Si la
base ya tiene las tablas porque se creó antes con `prisma db push`, se debe
registrar ese baseline una sola vez, sin volver a crear las tablas:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
```

En una base nueva, ejecutar directamente `npx prisma migrate deploy` y luego
`npm run db:seed`. No usar `db:push` como mecanismo habitual de producción:
queda reservado para iteración local o recuperación controlada.

## Rutina diaria de Fede (30–45 min)

1. Abrir **Asistente CM**: la cola ya viene priorizada y con propuestas generadas.
2. Descartar lo que no corresponde.
3. Revisar la propuesta; si hace falta, rehacerla o ajustarla por chat.
4. **Publicar en YouTube** desde la misma tarjeta.
5. Marcar como ejemplo las respuestas que quedaron muy bien: el sistema aprende de ellas.

## Publicación compatible con plataformas

- **YouTube:** la respuesta aprobada se publica con YouTube Data API y OAuth de la cuenta autorizada. Configurar `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` y `SOCIAL_TOKEN_ENCRYPTION_KEY`; desde el Asistente CM, elegir **Conectar cuenta de YouTube** y aceptar el permiso. Los tokens se guardan cifrados en la base.
- Para revocar una conexión de YouTube, enviar `DELETE /api/integrations/youtube?client=<slug>&account=<cuenta>` con una sesión del cliente; también se revoca el token de Google cuando está disponible.

## Monitoreo semi-automático (Fase 6)

Las fuentes se configuran en `/monitoring`. Para correrlas:

```bash
npm run agents:monitor -- --dry-run   # sin escribir en DB
npm run agents:monitor                 # corrida real
```

Para automatizar en Windows, crear una tarea en el Programador de tareas:

```
Programa:   cmd.exe
Argumentos: /c cd /d D:\pcmidi-suite && npm run agents:monitor
```

Cada corrida deja un reporte JSON en `reports/`.

## Backup de base de datos

## Logs del sistema

Los errores de IA y eventos de rate limiting quedan en la tabla `SystemLog` de Supabase. Consultables desde Prisma Studio (`npm run db:studio`) o directamente en el panel de Supabase.

Ver `AGENTS.md` para el estado actual y la arquitectura.
