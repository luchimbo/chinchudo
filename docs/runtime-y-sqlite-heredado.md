# Runtime y SQLite heredado

Supabase Postgres es la única fuente de verdad productiva. Los intakes, backups rotados y archivos de ejecución viven en `runtime/`, carpeta ignorada por Git; los archivos históricos bajo `data/` no se eliminan automáticamente.

Para recuperar o depurar un intake archivado, copiá el JSONL desde `runtime/archive/` a una ubicación temporal y ejecutá el importador con `--input`. La limpieza es manual: mové los archivos a la Papelera sólo después de validar el reporte de importación correspondiente.

Los entrypoints SQLite heredados son `src/authority_swarm/cli.py`, `agents/agente_4_nurture.py`, `agents/agente_conversion.py` y `scripts/db-apply-diff.mjs`. Están bloqueados en producción y, en desarrollo, requieren `ALLOW_SQLITE_SANDBOX=1`. Los flujos operativos deben usar Prisma/Supabase; el healthcheck falla si producción no tiene `DATABASE_URL` o habilita el sandbox SQLite.
