#!/usr/bin/env bash
# Cuota diaria de borradores en el servidor Linux "pcmidi", disparada por cron cada hora.
# El monitor sigue en la PC (necesita los perfiles de NSTBrowser); acá solo se generan
# borradores en modo --copilot, que nunca publica.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.local/node/bin:$PATH"
export TZ="America/Argentina/Buenos_Aires"

LOG_DIR="$ROOT/logs"
mkdir -p "$LOG_DIR" "$ROOT/data"
LOG="$LOG_DIR/draft-cron-$(date +%Y%m%d-%H%M%S).log"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

cd "$ROOT"

# Si la corrida anterior sigue generando, esta se omite en vez de pisarla.
exec 9>"$ROOT/data/draft-cron.lock"
if ! flock -n 9; then
  log "Otra corrida de borradores sigue activa; se omite esta."
  exit 0
fi

log "=== draft-cron inicio ==="
npm run --silent agents:draft-daily-quota >> "$LOG" 2>&1
code=$?
if [ "$code" -ne 0 ]; then
  log "WARN: cuota diaria de borradores fallo (exit $code)."
else
  log "cuota diaria de borradores OK"
fi
log "=== draft-cron fin ==="

find "$LOG_DIR" -name 'draft-cron-*.log' -mtime +30 -delete
exit "$code"
