#!/usr/bin/env python3
"""TEMPORARY diagnostic script - not part of the shipped pipeline. Snapshots
the full cookie table at several points after login completes, so we can see
which cookies actually persist vs. which are transient. Prints only name,
host_key, path, and timestamps - NEVER encrypted_value or a decrypted value,
since this repo's Actions logs are public.
"""
import os
import shutil
import sqlite3
import sys
import tempfile
import time


def snapshot(db_path: str, label: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        dest_path = os.path.join(tmp, "Cookies")
        try:
            shutil.copy(db_path, dest_path)
            for sidecar in ("-wal", "-shm"):
                src_sidecar = db_path + sidecar
                if os.path.exists(src_sidecar):
                    shutil.copy(src_sidecar, dest_path + sidecar)
        except OSError as e:
            print(f"[diagnose] {label}: copy failed ({e.__class__.__name__}: {e})")
            return

        try:
            conn = sqlite3.connect(f"file:{dest_path}?mode=ro", uri=True)
            try:
                rows = conn.execute(
                    """SELECT name, host_key, path, creation_utc, expires_utc, is_persistent
                       FROM cookies
                       WHERE host_key LIKE '%permisdeconduire.gouv.fr'
                       ORDER BY host_key, name"""
                ).fetchall()
            finally:
                conn.close()
        except sqlite3.Error as e:
            print(f"[diagnose] {label}: query failed ({e.__class__.__name__}: {e})")
            return

        print(f"[diagnose] {label}: {len(rows)} cookies")
        for name, host_key, path, creation_utc, expires_utc, is_persistent in rows:
            print(
                f"[diagnose]   name={name!r} host_key={host_key!r} path={path!r} "
                f"creation_utc={creation_utc} expires_utc={expires_utc} is_persistent={is_persistent}"
            )


def main(argv: list[str]) -> int:
    db_path = argv[0]
    schedule = [0, 3, 8, 15, 25, 40]
    start = time.time()
    for delay in schedule:
        elapsed = time.time() - start
        remaining = delay - elapsed
        if remaining > 0:
            time.sleep(remaining)
        snapshot(db_path, f"t+{delay}s")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
