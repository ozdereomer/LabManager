#!/usr/bin/env bash

set -Eeuo pipefail

OPERATION="${1:?Operation is required}"

case "$OPERATION" in
    backup)
        SERVICE="labmanager-backup.service"
        ;;
    restore)
        SERVICE="labmanager-restore-verify.service"
        ;;
    *)
        echo "ERROR: Invalid operation."
        exit 1
        ;;
esac

SUCCESS=0

if [[ "${SERVICE_RESULT:-unknown}" == "success" ]]; then
    SUCCESS=1
fi

START="$(systemctl show "$SERVICE" \
    -p ExecMainStartTimestampMonotonic --value)"

END="$(systemctl show "$SERVICE" \
    -p ExecMainExitTimestampMonotonic --value)"

DURATION="$(python3 - "$START" "$END" <<'PY'
import sys

try:
    start = int(sys.argv[1])
    end = int(sys.argv[2])
    duration = (end - start) / 1_000_000
    print(max(0, duration) if start > 0 else 0)
except (ValueError, IndexError):
    print(0)
PY
)"

echo "Operation: $OPERATION"
echo "Service result: ${SERVICE_RESULT:-unknown}"
echo "Success: $SUCCESS"
echo "Duration: ${DURATION}s"

/usr/local/sbin/labmanager-write-backup-metrics \
    "$OPERATION" "$SUCCESS" "$DURATION"
