#!/usr/bin/env bash
# Backup diario de la base (Supabase) en el servidor "pcmidi". Lo llama cron cada hora:
# solo hace una copia si la última tiene más de 20 horas, así un día con el servidor
# apagado a la hora de siempre se recupera apenas vuelve. Guarda las últimas 14.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_BIN="${NODE_BIN:-$HOME/.local/lib/nodejs/bin/node}"
export PATH="$(dirname "$NODE_BIN"):$PATH"
export BACKUP_DIR="${BACKUP_DIR:-$HOME/backups/pcmidi-suite}"
LOG="$ROOT/reports/backup-db.log"
mkdir -p "$BACKUP_DIR" "$ROOT/reports"

exec 9>"${TMPDIR:-/tmp}/pcmidi-backup-db.lock"
flock -n 9 || exit 0

latest="$(ls -1t "$BACKUP_DIR"/supabase-*.json 2>/dev/null | head -1)"
if [[ -n "$latest" ]] && [[ $(( $(date +%s) - $(stat -c %Y "$latest") )) -lt $(( 20 * 3600 )) ]]; then
  exit 0
fi

if [[ -f "$LOG" ]] && [[ "$(stat -c %s "$LOG")" -gt 1048576 ]]; then mv -f "$LOG" "$LOG.1"; fi
cd "$ROOT"
{
  echo "== $(date -Is)"
  "$NODE_BIN" --env-file="$ROOT/.env" scripts/backup-db.mjs
  echo "exit $?"
} >> "$LOG" 2>&1
