# Plan de Remediación — pcmidi-suite (Los 5 Apóstoles)

Plan derivado de la auditoría del 2026-07-17. Objetivo: eliminar riesgos operativos y deuda técnica sin romper el flujo diario de Fede.

## Fase 1 — Seguridad inmediata

1. **Dry-run real en publicación** (riesgo más grave: hoy `--dry-run` publica igual).
   - `scripts/publish-response.mjs`: evaluar `dryRun` antes de llamar a `runPublisher`.
   - `scripts/publish-utils.mjs`: propagar `--dry-run` a `agents/publisher.py`.
2. **JWT con expiración**: `src/lib/auth-crypto.ts` firma `exp` (ej. 12h) y `verifyJwt` lo valida.
3. **Eliminar bypass maestro**: quitar `session === AUTH_SECRET` como admin global en `middleware.ts` y `src/lib/auth.ts`. El login maestro sigue existiendo pero emite un JWT normal con expiración.

## Fase 2 — Integridad de datos

4. **Re-encodear `prisma/seed.ts` a UTF-8** (hoy Latin-1 → insertaría personas corruptas `T�cnico` que rompen `persona-router.ts`).
5. **Migración baseline PostgreSQL + `migration_lock.toml`**: generar SQL desde el schema actual con `prisma migrate diff`, crear `prisma/migrations/0_init/migration.sql`, y documentar `prisma migrate resolve --applied 0_init` para la DB existente (Supabase ya tiene las tablas vía `db push`).

## Fase 3 — Comandos de agentes rotos

6. **Imports `lib.*`**: agregar raíz del repo a `sys.path` en `agents/agente_4_nurture.py`, `agents/agente_geo_audit.py`, `agents/agente_conversion.py` y `agents/ag_api/*`.
7. **Subcomandos del orchestrator**: pasar `process`/`audit`/`run` según corresponda en `agents/orchestrator.py` (nurture/geo-audit/conversion).
8. **`requirements-social-listening.txt` completo**: agregar `psycopg[binary]`, `python-dotenv`, `feedparser`, `requests`, `duckduckgo-search`, `openai`, `edge-tts`.

## Fase 4 — Higiene

9. **Scripts zombis**: `sync-sqlite.mjs` (deprecar con error claro), `backup-db.mjs` (respaldo real vía Supabase/pg_dump o aviso), `scripts/scheduled-trends-task.xml` y `start-remote.ps1` (paths `D:\10Apostoles` → `D:\pcmidi-suite`).
10. **Unificar `getRelayUrl`**: una sola implementación (DB + fallback env) usada por `settings.ts`, `relay-client.ts` y `api/opportunities/search/run`.
11. **PrismaClient singleton en auth routes**: `api/auth/login` y `api/auth/register` usan `src/lib/db.ts`, sin `$disconnect()` por request.
12. **Bug de scope en resumen semanal**: `api/analytics/summary/route.ts` pasa `clientId` a `getAnalyticsData()`.
13. **Filtro por marca** en `(redes)/oportunidades` + `filter-bar.tsx`.
14. **Export CSV en la app**: endpoint/botón en el listado de oportunidades (además del CLI existente).

## Fase 5 — Normalización Next 14

15. Convertir páginas con `searchParams`/`params: Promise<...>` (estilo Next 15) al estilo objeto de Next 14, que es la versión pineada (`next@^14.2.35`). ~15 archivos.

## Fase 6 — Documentación

16. **AGENTS.md**: Supabase Postgres (no SQLite), NSTBrowser como provider default, OpenRouter, scripts `.mts`, comandos nuevos (`monitor`, `healthcheck`, `trend-listen`, `daily-quota`...), clientes prestige/jurispedia, publicación asistida existente.
17. **`.env.example`**: agregar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_USERS_JSON`, `OPENROUTER_*`, `NSTBROWSER_API_BASE`, `DOLPHIN_API_TOKEN/BASE`, `CREATOMATE_*`, `HEYGEN_*`, `DID_*`, `DAILY_QUOTA_*`, `OPPORTUNITY_CLASSIFIER_TIMEOUT_MS`, etc.

## Verificación final

- `npx tsc --noEmit`, `npm run lint`, `npm test` (vitest), `python -m pytest agents/tests`.
- Smoke: `python agents/orchestrator.py nurture --help`-equivalente y `agents:publish --dry-run` sin efectos.

## Fuera de alcance (registrado para después)

- Clasificador IA: timeout de 12s descarta oportunidades (subir `OPPORTUNITY_CLASSIFIER_TIMEOUT_MS` o reintentos).
- Trend-listen agota presupuesto de 600s (Jurispedia sin tendencias).
- Sesión Reddit `deportista-aficionado` caída (`not_logged_in`) — requiere re-login manual de Fede.
- Rotación de `reports/` (~4.700 JSON acumulados).
- `execFileSync` en server actions (mover a relay asíncrono).
- Refactor de duplicaciones (`fetchWithRetry`, `extractPostKey`, helpers de avatar/label).
