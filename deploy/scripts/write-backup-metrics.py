#!/usr/bin/env python3

import argparse
import math
import os
import re
import tempfile
import time
from pathlib import Path

METRICS_DIR = Path("/var/lib/labmanager/metrics")
BACKUP_DIR = Path("/var/backups/labmanager/database")

parser = argparse.ArgumentParser()

parser.add_argument("operation", choices=["backup", "restore"])
parser.add_argument("success", type=int, choices=[0, 1])
parser.add_argument("duration", type=float)

args = parser.parse_args()

if not math.isfinite(args.duration) or args.duration < 0:
    parser.error("Duration must be finite and non-negative.")

if os.geteuid() != 0:
    raise SystemExit("Run this script as root.")

prefix = f"labmanager_{args.operation}"
destination = METRICS_DIR / f"{prefix}.prom"

timestamp_metric = f"{prefix}_last_success_timestamp_seconds"

last_success = 0

if destination.exists():
    for line in destination.read_text().splitlines():
        if line.startswith(timestamp_metric + " "):
            last_success = int(line.split()[1])

if args.success == 1:
    last_success = int(time.time())

metrics = {
    f"{prefix}_success": args.success,
    timestamp_metric: last_success,
    f"{prefix}_duration_seconds": round(args.duration, 3),
}

if args.operation == "backup":
    backups = sorted(
        path for path in BACKUP_DIR.iterdir()
        if path.is_dir()
        and not path.is_symlink()
        and re.fullmatch(
            r"labmanager-[0-9]{8}T[0-9]{6}Z",
            path.name,
        )
        and all(
            (path / name).is_file()
            and not (path / name).is_symlink()
            for name in (
                "database.dump",
                "SHA256SUMS",
                "archive-list.txt",
            )
        )
    )

    metrics["labmanager_backup_count"] = len(backups)

    metrics["labmanager_backup_size_bytes"] = (
        (backups[-1] / "database.dump").stat().st_size
        if backups else 0
    )

temporary = None

try:
    with tempfile.NamedTemporaryFile(
        mode="w",
        dir=METRICS_DIR,
        prefix=".metrics-",
        delete=False,
    ) as file:
        temporary = Path(file.name)

        for name, value in metrics.items():
            file.write(f"# TYPE {name} gauge\n")
            file.write(f"{name} {value}\n")

        file.flush()
        os.fsync(file.fileno())

    temporary.chmod(0o644)
    os.replace(temporary, destination)

finally:
    if temporary is not None:
        temporary.unlink(missing_ok=True)

print(f"Metrics published: {destination.name}")
