#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BACKUP_DIR="/var/backups/labmanager/database"
CONTAINER="postgres-db"
DB_NAME="labmanager"
DB_USER="labmanager_user"
RETENTION_DAYS=30

log() {
    printf '[%s] %s\n' \
        "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

if [[ "$EUID" -ne 0 ]]; then
    log "ERROR: Run this script as root."
    exit 1
fi

install -d -m 700 -o root -g root "$BACKUP_DIR"

exec 9>"$BACKUP_DIR/.backup.lock"

log "Waiting for database backup lock."

if ! flock -w 120 9; then
    log "ERROR: Another backup is running."
    exit 1
fi

TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
BACKUP_NAME="labmanager-${TIMESTAMP}"
FINAL_DIR="$BACKUP_DIR/$BACKUP_NAME"

if [[ -e "$FINAL_DIR" ]]; then
    log "ERROR: Backup destination already exists."
    exit 1
fi

TEMP_DIR="$(mktemp -d "$BACKUP_DIR/.backup-XXXXXX")"

cleanup() {
    local status=$?
    trap - EXIT

    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf -- "$TEMP_DIR"
    fi

    if [[ "$status" -ne 0 ]]; then
        log "ERROR: Database backup failed."
    fi

    exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

log "Starting PostgreSQL backup."

docker exec "$CONTAINER" pg_dump \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-password \
    --format=custom \
    --compress=6 \
    > "$TEMP_DIR/database.dump"

test -s "$TEMP_DIR/database.dump"

log "Validating backup archive."

docker exec -i "$CONTAINER" pg_restore \
    --list \
    < "$TEMP_DIR/database.dump" \
    > "$TEMP_DIR/archive-list.txt"

test -s "$TEMP_DIR/archive-list.txt"

(
    cd "$TEMP_DIR"
    sha256sum database.dump > SHA256SUMS
    sha256sum --check SHA256SUMS
)

chmod 600 "$TEMP_DIR/database.dump"
chmod 600 "$TEMP_DIR/archive-list.txt"
chmod 600 "$TEMP_DIR/SHA256SUMS"

mv -T -- "$TEMP_DIR" "$FINAL_DIR"


log "Applying ${RETENTION_DAYS}-day retention policy."

CUTOFF="$(date -u -d "$RETENTION_DAYS days ago" +'%Y%m%dT%H%M%SZ')"
REMOVED=0

for CANDIDATE in "$BACKUP_DIR"/labmanager-*; do
    [[ -d "$CANDIDATE" && ! -L "$CANDIDATE" ]] || continue
    [[ "$CANDIDATE" != "$FINAL_DIR" ]] || continue

    NAME="${CANDIDATE##*/}"

    if [[ ! "$NAME" =~ ^labmanager-[0-9]{8}T[0-9]{6}Z$ ]]; then
        continue
    fi

    [[ -f "$CANDIDATE/database.dump" ]] || continue
    [[ -f "$CANDIDATE/SHA256SUMS" ]] || continue
    [[ -f "$CANDIDATE/archive-list.txt" ]] || continue

    BACKUP_TIMESTAMP="${NAME#labmanager-}"

    if [[ "$BACKUP_TIMESTAMP" < "$CUTOFF" ]]; then
        log "Removing expired backup: $NAME"
        rm -rf -- "$CANDIDATE"
        REMOVED=$((REMOVED + 1))
    fi
done

log "Retention completed. Removed backups: $REMOVED"

log "Database backup completed successfully."
log "Backup location: $FINAL_DIR"
log "Backup size: $(du -h "$FINAL_DIR/database.dump" | cut -f1)"
