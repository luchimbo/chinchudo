#!/usr/bin/env bash
# Despliega el trabajador del blog en el servidor "pcmidi" desde una rama ya
# publicada en GitHub. Es el único procedimiento para actualizarlo: nada de
# copiar archivos sueltos.
#
#   bash scripts/server/deploy-blog-runtime.sh                # muestra qué haría
#   bash scripts/server/deploy-blog-runtime.sh --apply        # despliega origin/main
#   BLOG_DEPLOY_REF=mi-rama bash scripts/server/deploy-blog-runtime.sh --apply
#
# El servidor conserva .env, .venv, data/ y reports/ (no están versionados).
# El proceso blog-runtime-service.mjs corre en un bucle (start-blog-runtime-ssh.sh,
# lanzado por @reboot en crontab) y se reinicia solo al detectar código nuevo.
set -euo pipefail

HOST="${BLOG_SERVER_HOST:-pcmidi}"
REMOTE_DIR="${BLOG_SERVER_DIR:-services/pcmidi-suite}"
REF="${BLOG_DEPLOY_REF:-main}"
APPLY="${1:-}"

cd "$(git rev-parse --show-toplevel)"
git fetch -q origin "$REF"
TARGET="$(git rev-parse "origin/$REF")"
echo "Destino: $HOST:~/$REMOTE_DIR -> origin/$REF ($TARGET)"

ssh "$HOST" "cd ~/$REMOTE_DIR && echo 'Actual:' \$(git rev-parse --short HEAD) && git status --short | grep -v '^??' || true"

if [ "$APPLY" != "--apply" ]; then
  echo "Simulación: no se cambió nada. Repetí con --apply para desplegar."
  exit 0
fi

ssh "$HOST" "set -e
cd ~/$REMOTE_DIR
git fetch -q origin '$REF'
git reset -q --hard '$TARGET'
export PATH=\$HOME/.local/lib/nodejs/bin:\$PATH
npm ci --no-audit --no-fund --silent
npx prisma generate >/dev/null
chmod +x scripts/start-blog-runtime-ssh.sh
# El bucle de start-blog-runtime-ssh.sh vuelve a levantarlo en 10 s con el código nuevo.
pkill -f 'scripts/blog-runtime-service.mjs' || true
echo 'Desplegado:' \$(git rev-parse --short HEAD)"

echo "Esperá ~15 s y verificá con: npm run blog:status"
