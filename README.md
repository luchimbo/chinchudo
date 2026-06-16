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
| `AUTH_SECRET` | Contraseña para acceder al dashboard |

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

## Rutina diaria de Fede (30–45 min)

1. Abrir `http://localhost:3000` e ingresar con la contraseña.
2. Revisar oportunidades `Nuevas` en el tablero.
3. Descartar las irrelevantes.
4. Para las relevantes: elegir marca, producto y persona → **Generar respuestas**.
5. Editar la mejor variante y aprobarla.
6. Copiarla, publicarla manualmente en la red social.
7. Volver al sistema → **Marcar como publicada** + cargar URL y resultado.
8. Revisar los **follow-ups** pendientes.

## Rutina semanal de Fede (45–60 min)

1. Abrir `/analytics` → revisar tendencias y conversiones.
2. Generar el **Resumen Semanal IA** (botón en la página de analytics).
3. Identificar objeciones nuevas → cargarlas en `/knowledge`.
4. Pasarle el resumen a dirección.

## Monitoreo semi-automático (Fase 6)

Las fuentes se configuran en `/monitoring`. Para correrlas:

```bash
npm run agents:monitor -- --dry-run   # sin escribir en DB
npm run agents:monitor                 # corrida real
```

Para automatizar en Windows, crear una tarea en el Programador de tareas:

```
Programa:   cmd.exe
Argumentos: /c cd /d D:\10Apostoles && npm run agents:monitor
```

Cada corrida deja un reporte JSON en `reports/`.

## Backup de base de datos

```bash
node scripts/backup-db.mjs
```

Genera un export en `exports/backup-<fecha>.json`. Supabase también hace backups automáticos diarios.

## Logs del sistema

Los errores de IA y eventos de rate limiting quedan en la tabla `SystemLog` de Supabase. Consultables desde Prisma Studio (`npm run db:studio`) o directamente en el panel de Supabase.

## Fases completadas

| Fase | Descripción |
|---|---|
| 0 | Setup, repositorio, estructura base |
| 0.5 | Backend de agentes (CDP, social-listen, orchestrator) |
| 1 | MVP de datos: schema Prisma, seed, CRUD |
| 2 | Generador IA con OpenRouter |
| 3 | Dashboard operativo para Fede |
| 4 | Base de conocimiento (FAQs, objeciones) |
| 5 | Clasificación asistida |
| 6 | Monitoreo semi-automático |
| 7 | Analytics y reportes + resumen semanal IA |
| 8 | Producción: auth, logs persistentes, rate limits, backups |
