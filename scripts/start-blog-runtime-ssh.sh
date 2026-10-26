#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_HOME="${NODE_HOME:-$HOME/.local/lib/nodejs}"
NODE_BIN="${NODE_BIN:-$NODE_HOME/bin/node}"
LOCK_FILE="${BLOG_RUNTIME_LOCK_FILE:-${TMPDIR:-/tmp}/pcmidi-blog-runtime.lock}"

cd "$ROOT"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

export PATH="$NODE_HOME/bin:$PATH"
export AGENTS_PYTHON_BIN="${AGENTS_PYTHON_BIN:-$ROOT/.venv/bin/python}"
export NODE_BIN

rotate_log() {
  local path="$1"
  if [[ -f "$path" ]] && [[ "$(stat -c %s "$path")" -gt 5242880 ]]; then
    mv -f "$path" "$path.1"
  fi
}

while true; do
  rotate_log "$ROOT/reports/blog-runtime-ssh.log"
  rotate_log "$ROOT/reports/blog-runtime-ssh-errors.log"
  "$NODE_BIN" --env-file="$ROOT/.env" "$ROOT/scripts/blog-runtime-service.mjs" \
    >> "$ROOT/reports/blog-runtime-ssh.log" \
    2>> "$ROOT/reports/blog-runtime-ssh-errors.log"
  sleep 10
done
