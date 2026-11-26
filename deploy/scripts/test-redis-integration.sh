#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

RUN_ID="$(date +%s)-$$"
NETWORK="labmanager-redis-ci-${RUN_ID}"
REDIS_CONTAINER="labmanager-redis-ci-${RUN_ID}"
TEST_CONTAINER="labmanager-api-ci-${RUN_ID}"
TEST_IMAGE="labmanager-api-test:integration-${RUN_ID}"

REDIS_IMAGE="redis:8-alpine@sha256:5af80107c1eeecb484a2269b80a26d12bfa6521787da4663bd9f19f60a163483"

TEST_PASSWORD="isolated-test-password"
TEMP_DIR="$(mktemp -d)"

NETWORK_CREATED=0
REDIS_CREATED=0
IMAGE_CREATED=0

cleanup() {
    local status=$?

    trap - EXIT
    set +e

    echo "[Cleanup] Removing temporary test resources..."

    docker rm -fv "$TEST_CONTAINER" >/dev/null 2>&1

    if [ "$REDIS_CREATED" -eq 1 ]; then
        docker rm -fv "$REDIS_CONTAINER" >/dev/null
    fi

    if [ "$NETWORK_CREATED" -eq 1 ]; then
        docker network rm "$NETWORK" >/dev/null
    fi

    if [ "$IMAGE_CREATED" -eq 1 ]; then
        docker image rm "$TEST_IMAGE" >/dev/null
    fi

    rm -rf -- "$TEMP_DIR"

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

echo "[3/6] Creating internal network and Redis ACL..."

docker network create --internal "$NETWORK" >/dev/null
NETWORK_CREATED=1

PASSWORD_HASH="$(printf '%s' "$TEST_PASSWORD" | sha256sum | cut -d ' ' -f 1)"

printf 'user default off\nuser labmanager on #%s ~labmanager:ratelimit:* -@all +ping +get +set +incr +expire +ttl +pttl +pexpire +eval +evalsha +script|load\n' \
    "$PASSWORD_HASH" > "$TEMP_DIR/users.acl"

chmod 644 "$TEMP_DIR/users.acl"

echo "[4/6] Starting isolated Redis..."

docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$NETWORK" \
    --network-alias labmanager-redis-test \
    --memory 128m \
    -e REDISCLI_AUTH="$TEST_PASSWORD" \
    -v "$TEMP_DIR/users.acl:/etc/redis/users.acl:ro" \
    "$REDIS_IMAGE" \
    redis-server \
    --protected-mode yes \
    --maxmemory 64mb \
    --maxmemory-policy noeviction \
    --save "" \
    --appendonly no \
    --aclfile /etc/redis/users.acl >/dev/null

REDIS_CREATED=1

echo "[5/6] Waiting for Redis readiness..."

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
    echo "ERROR: Test Redis did not become ready"
    exit 1
fi

echo "[6/6] Running Redis integration tests..."

docker run --rm \
    --name "$TEST_CONTAINER" \
    --network "$NETWORK" \
    -e RUN_REDIS_INTEGRATION=1 \
    -e DATABASE_URL=sqlite:// \
    -e JWT_SECRET_KEY=local-test-key-not-for-production-0123456789abcdef \
    -e REDIS_HOST=labmanager-redis-test \
    -e REDIS_PASSWORD="$TEST_PASSWORD" \
    "$TEST_IMAGE" \
    python -m pytest \
    tests/test_redis_integration.py \
    tests/test_auth_redis_integration.py \
    -q --no-cov -W error::DeprecationWarning

echo "PASS: Redis integration tests completed successfully"
