#!/usr/bin/env bash
# Asistente CM en el servidor "pcmidi" (lanzado por @reboot en crontab):
#  - el procesador de la cola manual («Generar respuesta», «Rehacer»), siempre vivo;
#  - el mantenimiento de propuestas cada 15 minutos.
# La PC de PC MIDI puede correr los mismos procesos a la vez: la base de datos
# reparte los pedidos y el mantenimiento tiene su propio candado.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_HOME="${NODE_HOME:-$HOME/.local/lib/nodejs}"
NODE_BIN="${NODE_BIN:-$NODE_HOME/bin/node}"
LOCK_FILE="${CM_RUNTIME_LOCK_FILE:-${TMPDIR:-/tmp}/pcmidi-cm-runtime.lock}"

cd "$ROOT"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

export PATH="$NODE_HOME/bin:$PATH"
mkdir -p "$ROOT/reports"

rotate_log() {
  local path="$1"
  if [[ -f "$path" ]] && [[ "$(stat -c %s "$path")" -gt 5242880 ]]; then
    mv -f "$path" "$path.1"
  fi
}

run_tsx() {
  "$NODE_BIN" --env-file="$ROOT/.env" --env-file="$ROOT/scripts/server/llm.env" --env-file="$ROOT/scripts/server/cm-runtime.env" \
    "$ROOT/node_modules/tsx/dist/cli.mjs" "$@"
}

worker_loop() {
  while true; do
    rotate_log "$ROOT/reports/cm-runtime-worker.log"
    run_tsx "$ROOT/scripts/cm-manual-worker.mts" >> "$ROOT/reports/cm-runtime-worker.log" 2>&1
    sleep 10
  done
}

maintenance_loop() {
  while true; do
    rotate_log "$ROOT/reports/cm-runtime-maintenance.log"
    echo "== $(date -Is)" >> "$ROOT/reports/cm-runtime-maintenance.log"
    run_tsx "$ROOT/scripts/cm-maintenance.mts" >> "$ROOT/reports/cm-runtime-maintenance.log" 2>&1
    sleep 900
  done
}

# Only this shell holds the lock (fd 9): if the loops and their `sleep` inherited it, killing
# this shell on a deploy would leave the lock taken and the next start would exit at once.
worker_loop 9>&- &
maintenance_loop 9>&- &
wait
