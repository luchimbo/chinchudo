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
| `AUTH_SECRET` | Secreto de sesión para firmar acceso al dashboard |
| `AUTH_PASSWORD` | Contraseña legacy si no se usa `AUTH_USERS_JSON` |
| `AUTH_USERS_JSON` | Usuarios por cliente, opcional |

### Usuarios por cliente

Si existe `AUTH_USERS_JSON`, el login pide usuario y contraseña. Si no existe, sigue funcionando el modo legacy con `AUTH_PASSWORD`.

```env
AUTH_USERS_JSON='[
  {"username":"lucio","password":"cambiar","label":"Lucio","role":"admin","clientSlugs":["pcmidi","prestige-running"]},
  {"username":"fede","password":"cambiar","label":"Fede","role":"operator","clientSlugs":["pcmidi"]},
  {"username":"prestige","password":"cambiar","label":"Prestige","role":"operator","clientSlugs":["prestige-running"]}
]'
```

`admin` ve todos los clientes activos. `operator` solo ve los `clientSlugs` asignados.

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

## Radar de tendencias 2 veces al día

El radar de tendencias busca señales nuevas en Google Trends, X/Twitter, TikTok, Instagram/Reels y YouTube/Shorts, deduplica por URL e importa los hallazgos a la tabla `Trend`. También suma ideas virales generales de marketing para adaptar a guiones.

```bash
npm run agents:trend-listen -- --dry-run  # revisar sin importar
npm run agents:trend-listen -- --limit 10 # importa 10 de rubro + 10 virales por cliente activo
```

Para dejarlo automático en Windows, ejecutar PowerShell como Administrador:

```powershell
npm run agents:trends:install
```

Esto registra la tarea `Los5Apostoles-Tendencias` todos los días a las 10:00 y 16:00. Los logs quedan en `logs/trends-scheduled-*.log` y `logs/trend-listen-*.log`.

Opcional: `TRENDS_RUN_LIMIT` cambia el objetivo de tendencias de rubro y virales por cliente activo; `TRENDS_TIME_BUDGET_SECONDS` cambia el tiempo máximo del radar.

## Backup de base de datos

## Fotos de marca: Jurispedia y Prestige

La línea base y los hitos D+30/60/90/180/365 se guardan como snapshots inmutables de datos internos, con PDF y CSV. Para crear la base inmediatamente:

```bash
npm run brand:snapshots -- --bootstrap
```

Para registrar el corte diario automático a las 12:00 de Argentina, ejecutar PowerShell como administrador:

```powershell
npm run brand:snapshots:install
```

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
