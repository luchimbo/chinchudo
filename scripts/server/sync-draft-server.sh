#!/usr/bin/env bash
# Copia el código commiteado (HEAD) al servidor "pcmidi", reinstala dependencias y deja
# instalado el cron horario de borradores. Se corre desde la PC con Git Bash:
#
#   bash scripts/server/sync-draft-server.sh                 # solo código
#   bash scripts/server/sync-draft-server.sh --with-secrets  # también .env y agents/accounts.json
#
# Requisitos en el servidor: Node 22 en ~/.local/node (sin sudo).
set -euo pipefail

HOST="${DRAFT_SERVER_HOST:-pcmidi}"
REMOTE_DIR="pcmidi-suite"
# Borradores cada hora a los :20, de 8 a 22 hora Argentina. El servidor está en UTC y
# Argentina no tiene horario de verano: 8-22 ART = 11-23 y 0-1 UTC.
CRON_LINE='20 0,1,11-23 * * * $HOME/pcmidi-suite/scripts/server/run-draft-quota.sh'

cd "$(git rev-parse --show-toplevel)"

ssh "$HOST" "mkdir -p ~/$REMOTE_DIR/scripts/server ~/$REMOTE_DIR/logs ~/$REMOTE_DIR/data ~/$REMOTE_DIR/reports"
# Sin conversión CRLF: el servidor es Linux.
git -c core.autocrlf=false archive --format=tar HEAD | ssh "$HOST" "tar -x -C ~/$REMOTE_DIR"
# Los scripts del servidor se copian siempre desde el árbol de trabajo.
scp -q scripts/server/run-draft-quota.sh scripts/server/sync-draft-server.sh "$HOST:$REMOTE_DIR/scripts/server/"

if [ "${1:-}" = "--with-secrets" ]; then
  scp -q .env "$HOST:$REMOTE_DIR/.env"
  scp -q agents/accounts.json "$HOST:$REMOTE_DIR/agents/accounts.json"
  ssh "$HOST" "chmod 600 ~/$REMOTE_DIR/.env ~/$REMOTE_DIR/agents/accounts.json"
fi

ssh "$HOST" "set -e
cd ~/$REMOTE_DIR
sed -i 's/\r\$//' scripts/server/*.sh
chmod +x scripts/server/*.sh
export PATH=\$HOME/.local/node/bin:\$PATH
npm ci --no-audit --no-fund
npx prisma generate
(crontab -l 2>/dev/null | grep -v run-draft-quota.sh; echo '$CRON_LINE') | crontab -
crontab -l | grep run-draft-quota.sh"

echo "sync-draft-server: OK ($HOST:~/$REMOTE_DIR)"
