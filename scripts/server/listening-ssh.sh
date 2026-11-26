#!/usr/bin/env bash
# Búsqueda programada de oportunidades (YouTube) en el servidor "pcmidi". Reemplaza a
# scripts/run-scheduled.ps1 (tarea de Windows 10Apostoles-Monitor). Cron la llama cada 30 min
# entre las 07:30 y las 22:30 de Argentina:
#   1. cuota de Kressmer (en paralelo, como en la PC);
#   2. cuota diaria del resto de los clientes, una vez por día;
#   3. monitor de fuentes (agents/orchestrator.py monitor).
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_HOME="${NODE_HOME:-$HOME/.local/lib/nodejs}"
# `python` es el del proyecto: los scripts de Node lo llaman por nombre.
export PATH="$ROOT/.venv/bin:$NODE_HOME/bin:$PATH"
export AGENTS_PYTHON_BIN="$ROOT/.venv/bin/python"
LOG_DIR="$ROOT/logs"
MARKER="$ROOT/data/daily-opportunity-quota-last-run.txt"
mkdir -p "$LOG_DIR" "$ROOT/data"

exec 9>"${TMPDIR:-/tmp}/pcmidi-listening.lock"
flock -n 9 || exit 0

cd "$ROOT"
# Las claves vienen del .env del servidor (lo leen los scripts); la IA y Chrome, de estos dos.
set -a
. "$ROOT/scripts/server/llm.env"
. "$ROOT/scripts/server/listening.env"
set +a

stamp="$(date +%Y%m%d-%H%M%S)"
today="$(TZ=America/Argentina/Buenos_Aires date +%F)"
log() { echo "[$(date -Is)] $*" >> "$LOG_DIR/scheduled-$stamp.log"; }
# Logs de más de 7 días se borran: corre 30 veces por día.
find "$LOG_DIR" -maxdepth 1 -name '*-20*.log' -mtime +7 -delete 2>/dev/null

log "=== listening inicio ==="
node node_modules/tsx/dist/cli.mjs scripts/daily-opportunity-quota.mts --client kressmer >> "$LOG_DIR/kressmer-quota-$stamp.log" 2>&1 9>&- &
kressmer=$!

if [[ "$(cat "$MARKER" 2>/dev/null)" != "$today" ]]; then
  log "cuota diaria de oportunidades (sin Kressmer)"
  if node node_modules/tsx/dist/cli.mjs scripts/daily-opportunity-quota.mts --exclude-client kressmer >> "$LOG_DIR/opportunity-quota-$stamp.log" 2>&1; then
    echo "$today" > "$MARKER"; log "cuota diaria OK"
  else
    log "WARN: cuota diaria falló; se reintenta en la próxima corrida"
  fi
fi

log "monitor"
if python agents/orchestrator.py monitor >> "$LOG_DIR/monitor-$stamp.log" 2>&1; then log "monitor OK"; else log "ERROR: monitor falló"; fi
wait "$kressmer" 2>/dev/null
log "=== listening fin ==="
