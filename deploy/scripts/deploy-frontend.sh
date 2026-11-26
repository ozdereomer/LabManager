#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
WEB_ROOT="/var/www/labmanager"
BACKUP_ROOT="/var/backups/labmanager/frontend"
BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
BASE_URL="http://127.0.0.1"

exec 9>"$PROJECT_DIR/.frontend-deploy.lock"

if ! flock -n 9; then
    echo "Another deployment is already running."
    exit 1
fi

echo "[1/7] Checking deployment environment..."

sudo -v
sudo systemctl is-active --quiet nginx
sudo test -f "$WEB_ROOT/index.html"

echo "[2/7] Installing dependencies..."

cd "$FRONTEND_DIR"
npm ci

echo "[3/7] Running frontend tests and lint..."

npm run test:coverage
npm run lint

echo "[4/7] Building frontend..."

npm run build
test -s dist/index.html

echo "[5/7] Backing up current frontend..."

sudo install -d -m 700 "$BACKUP_ROOT"
sudo mkdir "$BACKUP_DIR"
sudo rsync -a "$WEB_ROOT/" "$BACKUP_DIR/"

rollback() {
    trap - ERR
    echo "Deployment failed. Restoring previous version..."

    if sudo rsync -a --delete "$BACKUP_DIR/" "$WEB_ROOT/"; then
        echo "Previous version restored."
    else
        echo "ERROR: Rollback failed. Check $BACKUP_DIR"
    fi

    exit 1
}

trap rollback ERR

echo "[6/7] Publishing new frontend..."

sudo rsync -a \
    --chown=root:root \
    --chmod=D755,F644 \
    --exclude='/index.html' \
    dist/ "$WEB_ROOT/"

sudo install -m 644 dist/index.html "$WEB_ROOT/.index.html.new"
sudo mv -f "$WEB_ROOT/.index.html.new" "$WEB_ROOT/index.html"

echo "[7/7] Running health checks..."

curl -fsS --max-time 10 "$BASE_URL/" -o /dev/null
curl -fsS --max-time 10 "$BASE_URL/api/health" -o /dev/null

curl -fsS --max-time 10 "$BASE_URL/" | cmp - dist/index.html

trap - ERR

echo "Frontend deployment completed successfully."
echo "Backup: $BACKUP_DIR"
