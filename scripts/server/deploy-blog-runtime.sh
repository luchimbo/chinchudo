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
# El patrón entre corchetes evita que pkill coincida con esta misma sesión SSH.
pkill -f 'blog-runtime-[s]ervice.mjs' || true
for i in \$(seq 1 30); do pgrep -f 'blog-runtime-[s]ervice.mjs' >/dev/null || break; sleep 1; done
# Un proceso viejo puede quedar trabado al desconectarse de la base: se fuerza.
pkill -9 -f 'blog-runtime-[s]ervice.mjs' || true
# Asistente CM: procesador de la cola y mantenimiento (start-cm-runtime-ssh.sh).
chmod +x scripts/start-cm-runtime-ssh.sh
CM_START=\$HOME/$REMOTE_DIR/scripts/start-cm-runtime-ssh.sh
crontab -l 2>/dev/null | grep -qF \"\$CM_START\" || (crontab -l 2>/dev/null; echo \"@reboot \$CM_START\") | crontab -
# El bucle vuelve a levantar el procesador con el código nuevo; el mantenimiento lo toma en su próxima vuelta.
pkill -f 'cm-manual-[w]orker.mts' || true
pgrep -f 'start-cm-runtime-[s]sh.sh' >/dev/null || setsid nohup \"\$CM_START\" >/dev/null 2>&1 < /dev/null &
echo 'Desplegado:' \$(git rev-parse --short HEAD)"

echo "Esperá ~15 s y verificá con: npm run blog:status"
