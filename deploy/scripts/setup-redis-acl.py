#!/usr/bin/env python3

import hashlib
import os
import re
import stat
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[2]
ENV_FILE = PROJECT_DIR / ".env"
ACL_FILE = PROJECT_DIR / "deploy/redis/users.acl"


def main():
    if not ENV_FILE.is_file():
        raise SystemExit("ERROR: .env file not found")

    if stat.S_IMODE(ENV_FILE.stat().st_mode) != 0o600:
        raise SystemExit("ERROR: .env permissions must be 600")

    passwords = []

    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("REDIS_PASSWORD="):
            passwords.append(line.split("=", 1)[1])

    if len(passwords) != 1:
        raise SystemExit(
            "ERROR: Exactly one REDIS_PASSWORD is required"
        )

    password = passwords[0]

    if not re.fullmatch(r"[a-f0-9]{64}", password):
        raise SystemExit(
            "ERROR: REDIS_PASSWORD must contain 64 lowercase hex characters"
        )

    password_hash = hashlib.sha256(
        password.encode("utf-8")
    ).hexdigest()

    content = (
        "user default off\n"
        f"user labmanager on #{password_hash} "
        "~labmanager:ratelimit:* -@all "
        "+ping +get +set +incr +expire +ttl "
        "+pttl +pexpire +eval +evalsha +script|load\n"
    )

    if ACL_FILE.is_symlink():
        raise SystemExit("ERROR: ACL file must not be a symbolic link")

    if ACL_FILE.exists():
        if not ACL_FILE.is_file():
            raise SystemExit("ERROR: Invalid ACL file")

        if ACL_FILE.read_text() != content:
            raise SystemExit(
                "ERROR: Existing ACL configuration differs. "
                "No changes made."
            )

        if stat.S_IMODE(ACL_FILE.stat().st_mode) != 0o640:
            raise SystemExit("ERROR: ACL permissions must be 640")

        print("PASS: Existing Redis ACL is valid")
        print("PASS: No changes made")
        return

    ACL_FILE.parent.mkdir(parents=True, exist_ok=True)

    fd = os.open(
        ACL_FILE,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL,
        0o640
    )

    with os.fdopen(fd, "w") as file:
        os.fchmod(file.fileno(), 0o640)
        file.write(content)

    print("PASS: Redis ACL created successfully")


if __name__ == "__main__":
    main()
