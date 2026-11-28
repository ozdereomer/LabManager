#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

BACKUP_DIR="/var/backups/labmanager/database"
PROD_CONTAINER="postgres-db"
RESTORE_CONTAINER="labmanager-restore-$(cat /proc/sys/kernel/random/uuid)"
DB_USER="labmanager_user"
DB_NAME="labmanager_restore"
CREATED=0

log() {
    printf '[%s] %s\n' \
        "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

if [[ "$EUID" -ne 0 ]]; then
    log "ERROR: Run this script as root."
    exit 1
fi

test -d "$BACKUP_DIR"

exec 9>"$BACKUP_DIR/.backup.lock"

log "Waiting for database backup lock."

if ! flock -w 120 9; then
    log "ERROR: Another backup operation is running."
    exit 1
fi

cleanup() {
    local status=$?
    trap - EXIT

    if [[ "$CREATED" -eq 1 ]]; then
        if ! docker rm -f -v "$RESTORE_CONTAINER" >/dev/null; then
            log "ERROR: Restore container cleanup failed."
            status=1
        fi
    fi

    if [[ "$status" -ne 0 ]]; then
        log "ERROR: Backup verification failed."
    else
        log "Backup verification completed successfully."
    fi

    exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

LATEST=""

for DIR in "$BACKUP_DIR"/labmanager-*; do
    [[ -d "$DIR" && ! -L "$DIR" ]] || continue

    NAME="${DIR##*/}"

    [[ "$NAME" =~ ^labmanager-[0-9]{8}T[0-9]{6}Z$ ]] || continue

    if [[ -z "$LATEST" || "$DIR" > "$LATEST" ]]; then
        LATEST="$DIR"
    fi
done

if [[ -z "$LATEST" ]]; then
    log "ERROR: No database backup found."
    exit 1
fi

log "Selected backup: ${LATEST##*/}"

cd "$LATEST"

for FILE in database.dump SHA256SUMS archive-list.txt; do
    test -f "$FILE"
    test ! -L "$FILE"
done

sha256sum --check SHA256SUMS

PG_IMAGE="$(docker inspect "$PROD_CONTAINER" --format '{{.Image}}')"

log "Creating isolated restore environment."

docker run -d \
    --name "$RESTORE_CONTAINER" \
    --network none \
    --memory 512m \
    --cpus 1 \
    --tmpfs /var/lib/postgresql/data:rw,size=256m \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_DB="$DB_NAME" \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    "$PG_IMAGE" >/dev/null

CREATED=1
READY=0

for i in $(seq 1 60); do
    if docker exec "$RESTORE_CONTAINER" \
        pg_isready -h 127.0.0.1 \
        -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        READY=1
        break
    fi

    sleep 1
done

test "$READY" -eq 1

test "$(docker inspect "$RESTORE_CONTAINER" \
    --format '{{.HostConfig.NetworkMode}}')" = "none"

query() {
    docker exec "$RESTORE_CONTAINER" psql \
        -X -qAt \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        -c "$1"
}

test "$(query 'SELECT current_database();')" = "$DB_NAME"

test "$(query "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")" = "0"

log "Restoring database archive."

docker exec -i "$RESTORE_CONTAINER" pg_restore \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --exit-on-error \
    --single-transaction \
    < database.dump

log "Validating restored tables."

for TABLE in users laboratories equipment maintenance_records alembic_version; do
    COUNT="$(query "SELECT count(*) FROM public.$TABLE;")"
    log "$TABLE: $COUNT records"
done

test "$(query 'SELECT count(*) FROM alembic_version;')" = "1"

ORPHANS="$(query "
SELECT
    (SELECT count(*) FROM laboratories l
     LEFT JOIN users u ON l.user_id = u.id
     WHERE u.id IS NULL)
    +
    (SELECT count(*) FROM equipment e
     LEFT JOIN laboratories l ON e.laboratory_id = l.id
     WHERE l.id IS NULL)
    +
    (SELECT count(*) FROM maintenance_records m
     LEFT JOIN equipment e ON m.equipment_id = e.id
     WHERE e.id IS NULL);
")"

test "$ORPHANS" = "0"

log "Foreign key integrity: PASS"

INVALID="$(query "
SELECT count(*)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
AND NOT convalidated;
")"

test "$INVALID" = "0"

log "Constraint validation: PASS"
log "Migration version: $(query 'SELECT version_num FROM alembic_version;')"
log "Restore verification: PASS"
