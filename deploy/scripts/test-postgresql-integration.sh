#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

RUN_ID="$(date +%s)-$$"

NETWORK="labmanager-postgres-ci-${RUN_ID}"
POSTGRES_CONTAINER="labmanager-postgres-ci-${RUN_ID}"
TEST_CONTAINER="labmanager-pg-api-ci-${RUN_ID}"
TEST_IMAGE="labmanager-api-test:postgres-${RUN_ID}"

POSTGRES_IMAGE="postgres:17.11@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f"

TEST_DB="labmanager_integration_test"
TEST_USER="labmanager_test"
TEST_PASSWORD="isolated-postgresql-test-password"

TEST_URL="postgresql+psycopg://${TEST_USER}:${TEST_PASSWORD}@labmanager-postgres-test:5432/${TEST_DB}"

NETWORK_CREATED=0
POSTGRES_CREATED=0
IMAGE_CREATED=0

cleanup() {
    local status=$?
    trap - EXIT
    set +e

    echo "[Cleanup] Removing temporary PostgreSQL test resources..."

    docker rm -fv "$TEST_CONTAINER" >/dev/null 2>&1

    if [ "$POSTGRES_CREATED" -eq 1 ]; then
        docker rm -fv "$POSTGRES_CONTAINER" >/dev/null || status=1
    fi

    if [ "$NETWORK_CREATED" -eq 1 ]; then
        docker network rm "$NETWORK" >/dev/null || status=1
    fi

    if [ "$IMAGE_CREATED" -eq 1 ]; then
        docker image rm "$TEST_IMAGE" >/dev/null || status=1
    fi

    exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[1/6] Checking Docker environment..."

docker info >/dev/null

echo "[2/6] Building isolated test image..."

docker build \
    --target test \
    -t "$TEST_IMAGE" .

IMAGE_CREATED=1

echo "[3/6] Creating isolated internal network..."

docker network create --internal "$NETWORK" >/dev/null

NETWORK_CREATED=1

echo "[4/6] Starting isolated PostgreSQL..."

docker run -d \
    --name "$POSTGRES_CONTAINER" \
    --network "$NETWORK" \
    --network-alias labmanager-postgres-test \
    --memory 512m \
    --cpus 1 \
    --tmpfs /var/lib/postgresql/data:rw,size=256m \
    -e POSTGRES_DB="$TEST_DB" \
    -e POSTGRES_USER="$TEST_USER" \
    -e POSTGRES_PASSWORD="$TEST_PASSWORD" \
    "$POSTGRES_IMAGE" >/dev/null

POSTGRES_CREATED=1

echo "[5/6] Waiting for PostgreSQL readiness..."

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
    echo "ERROR: Test PostgreSQL did not become ready"
    exit 1
fi

echo "[6/6] Running PostgreSQL integration tests..."

docker run --rm \
    --name "$TEST_CONTAINER" \
    --network "$NETWORK" \
    -e RUN_POSTGRESQL_INTEGRATION=1 \
    -e DATABASE_URL=sqlite:// \
    -e POSTGRESQL_TEST_URL="$TEST_URL" \
    -e JWT_SECRET_KEY=local-test-key-not-for-production-0123456789abcdef \
    "$TEST_IMAGE" \
    python -m pytest \
    tests/test_postgresql_integration.py \
    -q --no-cov

echo "PASS: PostgreSQL integration tests completed successfully"
