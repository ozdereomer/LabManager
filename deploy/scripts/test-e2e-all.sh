#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

RUNNER="$PROJECT_DIR/deploy/scripts/test-e2e.sh"

echo "=== Group 1/4: Smoke, Authentication and Settings ==="

LABMANAGER_E2E_RATE_LIMIT=0 bash "$RUNNER" \
    smoke.spec.js \
    auth.spec.js \
    settings.spec.js

echo "PASS: Group 1 - 23 tests"

echo "=== Group 2/4: Resource management ==="

LABMANAGER_E2E_RATE_LIMIT=0 bash "$RUNNER" \
    laboratories.spec.js \
    equipment.spec.js \
    maintenance.spec.js

echo "PASS: Group 2 - 25 tests"

echo "=== Group 3/4: Dashboard and Multi-user isolation ==="

LABMANAGER_E2E_RATE_LIMIT=0 bash "$RUNNER" \
    dashboard.spec.js \
    isolation.spec.js

echo "PASS: Group 3 - 16 tests"

echo "=== Group 4/4: Global registration rate limit ==="

LABMANAGER_E2E_RATE_LIMIT=1 bash "$RUNNER" \
    registration-rate-limit.spec.js

echo "PASS: Group 4 - 1 test"

echo "PASS: All E2E test groups completed"
