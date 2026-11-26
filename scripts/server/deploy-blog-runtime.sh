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
chmod +x scripts/start-blog-runtime-ssh.sh scripts/start-cm-runtime-ssh.sh
BLOG_START=\$HOME/$REMOTE_DIR/scripts/start-blog-runtime-ssh.sh
CM_START=\$HOME/$REMOTE_DIR/scripts/start-cm-runtime-ssh.sh
crontab -l 2>/dev/null | grep -qF \"\$CM_START\" || (crontab -l 2>/dev/null; echo \"@reboot \$CM_START\") | crontab -
# Backup de la base: cron cada hora; el script solo copia si la última tiene más de 20 h.
chmod +x scripts/server/backup-db-ssh.sh
BACKUP_START=\$HOME/$REMOTE_DIR/scripts/server/backup-db-ssh.sh
crontab -l 2>/dev/null | grep -qF \"\$BACKUP_START\" || (crontab -l 2>/dev/null; echo \"17 * * * * \$BACKUP_START\") | crontab -
# Búsqueda de oportunidades: cada 30 min de 07:00 a 22:30 de Argentina (el servidor está en UTC).
chmod +x scripts/server/listening-ssh.sh
LISTEN_START=\$HOME/$REMOTE_DIR/scripts/server/listening-ssh.sh
crontab -l 2>/dev/null | grep -qF \"\$LISTEN_START\" || (crontab -l 2>/dev/null; echo \"*/30 10-23,0-1 * * * \$LISTEN_START\") | crontab -
# Los bucles de arranque ya están leídos en memoria: para que tomen cambios en los scripts o en
# sus --env-file se reinician enteros. Primero los bucles (así no relanzan nada), después los procesos.
# Los patrones empiezan con la ruta del script, así no coinciden con esta misma sesión SSH.
pkill -f '^(/bin/sh -c |bash )/home/[^ ]+/scripts/start-(blog|cm)-runtime-ssh\\.sh\$' || true
pkill -f 'blog-runtime-[s]ervice.mjs' || true
pkill -f 'cm-manual-[w]orker.mts' || true
pkill -f 'cm-[m]aintenance.mts' || true
for i in \$(seq 1 30); do pgrep -f 'blog-runtime-[s]ervice.mjs|cm-manual-[w]orker.mts' >/dev/null || break; sleep 1; done
# Un proceso viejo puede quedar trabado al desconectarse de la base: se fuerza.
pkill -9 -f 'blog-runtime-[s]ervice.mjs|cm-manual-[w]orker.mts|cm-[m]aintenance.mts' || true
setsid nohup \"\$BLOG_START\" >/dev/null 2>&1 < /dev/null &
setsid nohup \"\$CM_START\" >/dev/null 2>&1 < /dev/null &
echo 'Desplegado:' \$(git rev-parse --short HEAD)"

echo "Esperá ~15 s y verificá con: npm run blog:status"
