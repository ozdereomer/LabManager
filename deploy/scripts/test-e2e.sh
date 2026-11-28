#!/usr/bin/env bash

set -Eeuo pipefail

RATE_LIMIT_MODE="${LABMANAGER_E2E_RATE_LIMIT:-0}"

case "$RATE_LIMIT_MODE" in
    0)
        for argument in "$@"; do
            if [[ "$argument" == *registration-rate-limit* ]]; then
                echo "ERROR: Registration rate limit test requires dedicated mode"
                exit 1
            fi
        done
        ;;
    1)
        if [ "$#" -ne 1 ] || [ "${1:-}" != "registration-rate-limit.spec.js" ]; then
            echo "ERROR: Rate limit mode requires only registration-rate-limit.spec.js"
            exit 1
        fi
        ;;
    *)
        echo "ERROR: LABMANAGER_E2E_RATE_LIMIT must be 0 or 1"
        exit 1
        ;;
esac

echo "PASS: E2E execution mode validated"


PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

RUN_ID="$(date +%s)-$$"
PREFIX="labmanager-e2e-${RUN_ID}"

NETWORK="${PREFIX}-network"
POSTGRES_CONTAINER="${PREFIX}-postgres"
REDIS_CONTAINER="${PREFIX}-redis"
API_CONTAINER="${PREFIX}-api"
MIGRATION_CONTAINER="${PREFIX}-migration"
RUNNER_CONTAINER="${PREFIX}-runner"

API_IMAGE="labmanager-api-e2e:${RUN_ID}"
RUNNER_IMAGE="labmanager-e2e:${RUN_ID}"

POSTGRES_IMAGE="postgres:17.11@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"

REDIS_IMAGE="redis:8-alpine@sha256:5af80107c1eeecb484a2269b80a26d12bfa6521787da4663bd9f19f60a163483"

TEST_DB="labmanager_e2e_test"
TEST_USER="labmanager_e2e"
TEST_PASSWORD="isolated-e2e-postgresql-password"
REDIS_PASSWORD="isolated-e2e-redis-password"

JWT_SECRET="e2e-only-key-not-for-production-$(openssl rand -hex 32)"

DATABASE_URL="postgresql+psycopg://${TEST_USER}:${TEST_PASSWORD}@labmanager-postgres-e2e:5432/${TEST_DB}"

TEMP_DIR="$(mktemp -d)"

cleanup() {
    local status=$?

    trap - EXIT
    set +e


    if docker container inspect "$RUNNER_CONTAINER" >/dev/null 2>&1; then
        echo "[Reports] Exporting Playwright artifacts..."

        for artifact in playwright-report test-results; do
            parent="$PROJECT_DIR/frontend/$artifact"
            destination="$parent/$RUN_ID"

            if [ -L "$parent" ] || [ -e "$destination" ] || [ -L "$destination" ]; then
                echo "ERROR: Unsafe report destination"
                status=1
                continue
            fi

            if ! mkdir -p -m 700 "$parent"; then
                status=1
                continue
            fi

            if ! chmod 700 "$parent"; then
                status=1
                continue
            fi

            if mkdir -m 700 "$destination" &&
                docker cp "$RUNNER_CONTAINER:/app/$artifact/." "$destination/"
            then
                echo "PASS: Exported $artifact"
            else
                echo "ERROR: Could not export $artifact"
                status=1
            fi

            find "$destination" -type d -exec chmod 700 {} + || status=1
            find "$destination" -type f -exec chmod 600 {} + || status=1

            if [ -n "${SUDO_UID:-}" ] && [ -n "${SUDO_GID:-}" ]; then
                chown "$SUDO_UID:$SUDO_GID" "$parent" || status=1
                chown -R "$SUDO_UID:$SUDO_GID" "$destination" || status=1
            fi

            echo "[Reports] Applied restricted permissions to $artifact"
        done
    fi

    echo "[Cleanup] Removing isolated E2E resources..."

    for container in \
        "$RUNNER_CONTAINER" \
        "$MIGRATION_CONTAINER" \
        "$API_CONTAINER" \
        "$REDIS_CONTAINER" \
        "$POSTGRES_CONTAINER"
    do
        if docker container inspect "$container" >/dev/null 2>&1; then
            docker rm -fv "$container" >/dev/null || status=1
        fi
    done

    if docker network inspect "$NETWORK" >/dev/null 2>&1; then
        docker network rm "$NETWORK" >/dev/null || status=1
    fi

    for image in "$API_IMAGE" "$RUNNER_IMAGE"; do
        if docker image inspect "$image" >/dev/null 2>&1; then
            docker image rm "$image" >/dev/null || status=1
        fi
    done

    rm -rf -- "$TEMP_DIR" || status=1

    exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[1/9] Checking Docker environment..."

docker info >/dev/null

echo "[2/9] Building isolated E2E images..."

docker build \
    --target production \
    -t "$API_IMAGE" .

docker build \
    -f frontend/Dockerfile.e2e \
    -t "$RUNNER_IMAGE" \
    frontend

echo "[3/9] Creating internal network..."

docker network create --internal "$NETWORK" >/dev/null

if [ "$(docker network inspect \
    --format '{{.Internal}}' "$NETWORK")" != "true" ]; then
    echo "ERROR: E2E network is not internal"
    exit 1
fi

echo "[4/9] Starting isolated PostgreSQL..."

docker run -d \
    --name "$POSTGRES_CONTAINER" \
    --network "$NETWORK" \
    --network-alias labmanager-postgres-e2e \
    --memory 512m \
    --cpus 1 \
    --tmpfs /var/lib/postgresql/data:rw,size=256m \
    -e POSTGRES_DB="$TEST_DB" \
    -e POSTGRES_USER="$TEST_USER" \
    -e POSTGRES_PASSWORD="$TEST_PASSWORD" \
    "$POSTGRES_IMAGE" >/dev/null

READY=0

for attempt in $(seq 1 60); do
    if docker exec "$POSTGRES_CONTAINER" \
        pg_isready \
        -h 127.0.0.1 \
        -U "$TEST_USER" \
        -d "$TEST_DB" >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -ne 1 ]; then
    echo "ERROR: E2E PostgreSQL is not ready"
    exit 1
fi

echo "PASS: PostgreSQL readiness"

echo "[5/9] Starting isolated Redis..."

PASSWORD_HASH="$(printf '%s' "$REDIS_PASSWORD" | sha256sum | cut -d ' ' -f 1)"

printf 'user default off\nuser labmanager on #%s ~labmanager:ratelimit:* -@all +ping +get +set +incr +expire +ttl +pttl +pexpire +eval +evalsha +script|load\n' \
    "$PASSWORD_HASH" > "$TEMP_DIR/users.acl"

chmod 644 "$TEMP_DIR/users.acl"

docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK" \
    --network-alias labmanager-redis-e2e \
    --memory 128m \
    -e REDISCLI_AUTH="$REDIS_PASSWORD" \
    -v "$TEMP_DIR/users.acl:/etc/redis/users.acl:ro" \
    "$REDIS_IMAGE" \
    redis-server \
    --protected-mode yes \
    --maxmemory 64mb \
    --maxmemory-policy noeviction \
    --save "" \
    --appendonly no \
    --aclfile /etc/redis/users.acl >/dev/null

READY=0

for attempt in $(seq 1 30); do
    if docker exec "$REDIS_CONTAINER" \
        redis-cli --user labmanager ping 2>/dev/null | grep -qx PONG; then
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -ne 1 ]; then
    echo "ERROR: E2E Redis is not ready"
    exit 1
fi

echo "PASS: Redis readiness"

echo "[6/9] Applying database migrations..."

docker run --rm \
    --name "$MIGRATION_CONTAINER" \
    --network "$NETWORK" \
    -e DATABASE_URL="$DATABASE_URL" \
    -e JWT_SECRET_KEY="$JWT_SECRET" \
    "$API_IMAGE" \
    python -m alembic upgrade head

echo "PASS: Database migrations"

echo "[7/9] Starting isolated FastAPI..."

docker run -d \
    --name "$API_CONTAINER" \
    --network "$NETWORK" \
    --network-alias labmanager-api-e2e \
    --memory 512m \
    --cpus 1 \
    -e DATABASE_URL="$DATABASE_URL" \
    -e JWT_SECRET_KEY="$JWT_SECRET" \
    -e REDIS_HOST=labmanager-redis-e2e \
    -e REDIS_PASSWORD="$REDIS_PASSWORD" \
    "$API_IMAGE" >/dev/null

READY=0

for attempt in $(seq 1 60); do
    if docker exec "$API_CONTAINER" python -c \
        'import json, urllib.request; assert json.load(urllib.request.urlopen('"'"'http://127.0.0.1:8000/health'"'"', timeout=2))["status"] == "healthy"' \
        >/dev/null 2>&1; then
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" -ne 1 ]; then
    echo "ERROR: E2E API is not ready"
    exit 1
fi

echo "PASS: FastAPI readiness"

echo "[Verification] Checking PostgreSQL and Redis connections..."

docker exec -i "$API_CONTAINER" python - <<'CHECK'
from sqlalchemy import text
from app.database import engine
from app.redis_client import get_redis_client
from app.rate_limiter import enforce_rate_limit
from fastapi import HTTPException
from uuid import uuid4

with engine.connect() as connection:
    database, username = connection.execute(
        text("SELECT current_database(), current_user")
    ).one()

    assert database == "labmanager_e2e_test"
    assert username == "labmanager_e2e"

    print("PASS: PostgreSQL database identity")

    revision = connection.execute(
        text("SELECT version_num FROM alembic_version")
    ).scalar_one()

    assert revision == "a71c92e4b605"
    print("PASS: PostgreSQL migration revision")

    for table in (
        "users",
        "laboratories",
        "equipment",
        "maintenance_records",
    ):
        count = connection.execute(
            text(f"SELECT COUNT(*) FROM {table}")
        ).scalar_one()

        assert count == 0

    print("PASS: Empty isolated database")

assert get_redis_client().ping() is True
print("PASS: Application Redis connection")

identifier = uuid4().hex

enforce_rate_limit("e2e-smoke", identifier, 2, 60)
enforce_rate_limit("e2e-smoke", identifier, 2, 60)

try:
    enforce_rate_limit("e2e-smoke", identifier, 2, 60)
except HTTPException as error:
    assert error.status_code == 429
    assert int(error.headers["Retry-After"]) > 0
else:
    raise AssertionError("Rate limit was not enforced")

print("PASS: Real Redis rate limiting")
CHECK


echo "[8/9] E2E infrastructure verification..."

NETWORK_ID="$(docker network inspect --format '{{.Id}}' "$NETWORK")"

if [ -z "$NETWORK_ID" ]; then
    echo "ERROR: Missing E2E network identity"
    exit 1
fi

verify_container_isolation() {
    local container="$1"
    local actual_network
    local published_ports
    local privileged

    actual_network="$(docker inspect         --format '{{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'         "$container")"

    if [ "$actual_network" != "$NETWORK_ID" ]; then
        echo "ERROR: Unexpected network identity: $container"
        return 1
    fi

    if [ "$(docker inspect         --format '{{len .NetworkSettings.Networks}}'         "$container")" != "1" ]; then
        echo "ERROR: Unexpected network count: $container"
        return 1
    fi

    published_ports="$(docker port "$container")"

    if [ -n "$published_ports" ]; then
        echo "ERROR: Unexpected published ports: $container"
        return 1
    fi

    privileged="$(docker inspect         --format '{{.HostConfig.Privileged}}'         "$container")"

    if [ "$privileged" != "false" ]; then
        echo "ERROR: Privileged container: $container"
        return 1
    fi

    echo "PASS: Container isolation: $container"
}

for container in "$POSTGRES_CONTAINER" "$REDIS_CONTAINER" "$API_CONTAINER"
do
    verify_container_isolation "$container"
done

if [ "$(docker network inspect --format '{{.Internal}}' "$NETWORK")" != "true" ]; then
    echo "ERROR: E2E network is not internal"
    exit 1
fi

echo "PASS: Exact network identity"
echo "PASS: No published ports"
echo "PASS: No privileged containers"
echo "PASS: Internal network isolation"
echo "PASS: E2E infrastructure ready"

echo "[9/9] Preparing Playwright E2E container..."

docker create \
    --name "$RUNNER_CONTAINER" \
    --network "$NETWORK" \
    --init \
    --memory 2g \
    --cpus 2 \
    --shm-size 512m \
    -e LABMANAGER_E2E=1 \
    -e CI=true \
    -e LABMANAGER_E2E_RATE_LIMIT="${LABMANAGER_E2E_RATE_LIMIT:-0}" \
    "$RUNNER_IMAGE" \
    npm run test:e2e -- "$@" >/dev/null

RUNNER_NETWORK="$(docker inspect \
    --format '{{.HostConfig.NetworkMode}}' \
    "$RUNNER_CONTAINER")"

if [ "$RUNNER_NETWORK" != "$NETWORK" ] &&
   [ "$RUNNER_NETWORK" != "$NETWORK_ID" ]; then
    echo "ERROR: Unexpected runner network"
    exit 1
fi

if [ "$(docker inspect --format '{{.HostConfig.Privileged}}' "$RUNNER_CONTAINER")" != "false" ]; then
    echo "ERROR: Privileged runner"
    exit 1
fi

if [ "$(docker inspect --format '{{len .HostConfig.PortBindings}}' "$RUNNER_CONTAINER")" != "0" ]; then
    echo "ERROR: Runner port bindings"
    exit 1
fi

if [ "$(docker inspect --format '{{.HostConfig.PublishAllPorts}}' "$RUNNER_CONTAINER")" != "false" ]; then
    echo "ERROR: Runner automatic port publishing"
    exit 1
fi

if [ "$(docker inspect --format '{{len .Mounts}}' "$RUNNER_CONTAINER")" != "0" ]; then
    echo "ERROR: Unexpected runner mounts"
    exit 1
fi

if [ "$(docker inspect --format '{{.Config.User}}' "$RUNNER_CONTAINER")" != "pwuser" ]; then
    echo "ERROR: Unexpected runner user"
    exit 1
fi

echo "PASS: Runner network configuration"
echo "PASS: Runner has no published ports"
echo "PASS: Runner has no mounted host resources"
echo "PASS: Runner non-root configuration"
echo "PASS: Runner pre-start security checks"

echo "[Playwright] Starting isolated E2E tests..."

docker start -a "$RUNNER_CONTAINER"

RUNNER_EXIT_CODE="$(docker inspect \
    --format '{{.State.ExitCode}}' \
    "$RUNNER_CONTAINER")"

if [ "$RUNNER_EXIT_CODE" != "0" ]; then
    echo "ERROR: Playwright exited with code $RUNNER_EXIT_CODE"
    exit 1
fi

echo "PASS: Playwright E2E tests"
