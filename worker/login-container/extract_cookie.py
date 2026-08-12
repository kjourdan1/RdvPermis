#!/usr/bin/env python3
"""Reads Chromium's session cookies for candidat.permisdeconduire.gouv.fr
directly from its on-disk SQLite database, instead of driving Chrome
DevTools via blind pixel-coordinate clicks. See
docs/superpowers/specs/2026-08-12-cookie-extraction-sqlite.md for why.
"""
import hashlib
import os
import shutil
import sqlite3
import sys
import tempfile
import time

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA1
from Crypto.Util.Padding import unpad


TARGET_HOST_KEYS = ("candidat.permisdeconduire.gouv.fr", ".permisdeconduire.gouv.fr")


def query_cookie_rows(db_path: str) -> list[dict]:
    """Reads rows scoped to the candidat API host and its parent domain
    from an already-copied (not live-locked) Cookies sqlite file."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        placeholders = ",".join("?" for _ in TARGET_HOST_KEYS)
        cursor = conn.execute(
            f"""SELECT name, host_key, path, creation_utc, encrypted_value
                FROM cookies
                WHERE host_key IN ({placeholders}) AND path = '/'""",
            TARGET_HOST_KEYS,
        )
        return [
            {
                "name": name,
                "host_key": host_key,
                "path": path,
                "creation_utc": creation_utc,
                "encrypted_value": encrypted_value,
            }
            for name, host_key, path, creation_utc, encrypted_value in cursor.fetchall()
        ]
    finally:
        conn.close()


def decrypt_cookie_value(encrypted_value: bytes, host_key: str) -> str:
    """Decrypts a Chromium Linux 'v10' encrypted_value blob (no OS
    keyring present, so the fixed 'peanuts' password is used - see the
    spec for the full algorithm citation)."""
    if not encrypted_value.startswith(b"v10"):
        raise ValueError(
            f"encrypted_value does not start with v10 prefix (got {encrypted_value[:3]!r})"
        )
    ciphertext = encrypted_value[3:]
    key = PBKDF2(b"peanuts", b"saltysalt", dkLen=16, count=1, hmac_hash_module=SHA1)
    iv = b" " * 16
    cipher = AES.new(key, AES.MODE_CBC, iv)
    padded = cipher.decrypt(ciphertext)
    prefixed = unpad(padded, 16)
    # Schema version >= 24 prepends a SHA256(host_key) digest before the
    # real value - this repo's Cookies db is schema version 24 (verified
    # against a real login, see the spec).
    digest_len = hashlib.sha256().digest_size
    expected_prefix = hashlib.sha256(host_key.encode()).digest()
    if prefixed[:digest_len] != expected_prefix:
        raise ValueError(f"host_key digest mismatch decrypting cookie for {host_key!r}")
    return prefixed[digest_len:].decode("utf-8")


def build_cookie_header(cookies: list[dict]) -> str:
    """RFC 6265 §5.4 order: longest path first, then oldest creation
    time first - matches what a real browser sends, since this
    codebase already treats fingerprint-level details as things
    Cloudflare's bot-management can key on (see the spec)."""
    ordered = sorted(cookies, key=lambda c: (-len(c["path"]), c["creation_utc"]))
    return "; ".join(f"{c['name']}={c['value']}" for c in ordered)


def _copy_db_with_sidecars(source_db_path: str, dest_dir: str, _copy_fn=shutil.copy) -> str:
    """Copies the Cookies file plus its -wal/-shm sidecars (if present) into
    dest_dir, so callers never read against Chromium's live, possibly
    mid-write file. Returns the copied Cookies path."""
    dest_path = os.path.join(dest_dir, "Cookies")
    _copy_fn(source_db_path, dest_path)
    for sidecar in ("-wal", "-shm"):
        src_sidecar = source_db_path + sidecar
        if os.path.exists(src_sidecar):
            _copy_fn(src_sidecar, dest_path + sidecar)
    return dest_path


def wait_for_required_cookies(
    source_db_path: str,
    required_names: set[str],
    *,
    max_attempts: int = 10,
    delay_s: float = 1.0,
    sleep_fn=None,
    _copy_fn=shutil.copy,
) -> list[dict]:
    """Chromium may not have flushed the very latest cookie writes to
    disk the instant login completes - retries a bounded number of times
    instead of a single blind sleep."""
    sleep_fn = sleep_fn or time.sleep
    last_missing: set[str] = set(required_names)
    last_db_error: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        with tempfile.TemporaryDirectory() as tmp:
            try:
                last_db_error = None  # Reset error state at start of each attempt
                dest_path = _copy_db_with_sidecars(source_db_path, tmp, _copy_fn=_copy_fn)
                rows = query_cookie_rows(dest_path)
                present_names = {r["name"] for r in rows}
                last_missing = required_names - present_names
                if not last_missing:
                    return rows
            except sqlite3.Error as e:
                # Torn copy mid-write (Chromium still flushing) - treat as "not ready yet"
                last_db_error = e
                last_missing = required_names  # All cookies missing if we can't read the DB

        status = "giving up" if attempt == max_attempts else "retrying"
        message = f"[extract_cookie] attempt {attempt}/{max_attempts}: "
        if last_db_error:
            message += f"database error ({last_db_error.__class__.__name__}), {status}"
        else:
            message += f"still missing {sorted(last_missing)}, {status}"
        print(message)

        if attempt < max_attempts:
            sleep_fn(delay_s)

    if last_db_error:
        raise TimeoutError(
            f"required cookies never appeared after {max_attempts} attempts "
            f"(last error: {last_db_error.__class__.__name__}: {last_db_error})"
        )
    else:
        raise TimeoutError(
            f"required cookies never appeared after {max_attempts} attempts: {sorted(last_missing)}"
        )


REQUIRED_COOKIE_NAMES_PREFIXES = ("mod_auth_openidc_state_",)
REQUIRED_COOKIE_NAMES_EXACT = ("cf_clearance",)


def _required_names_present(rows: list[dict]) -> set[str]:
    """The openidc state cookie's name has a random suffix, so we can't
    match it by exact name up front - this resolves the *actual* required
    name set against whatever's really in the db, for wait_for_required_cookies
    to check against on each attempt."""
    names = {r["name"] for r in rows}
    required = set(REQUIRED_COOKIE_NAMES_EXACT)
    for name in names:
        if name.startswith(REQUIRED_COOKIE_NAMES_PREFIXES):
            required.add(name)
    return required


REQUIRED_COOKIE_NAMES = REQUIRED_COOKIE_NAMES_EXACT + REQUIRED_COOKIE_NAMES_PREFIXES


def _resolve_required_names(
    db_path: str,
    *,
    max_attempts: int = 10,
    delay_s: float = 1.0,
    sleep_fn=None,
    _copy_fn=shutil.copy,
) -> set[str]:
    """Resolves the openidc state cookie's actual random-suffixed name by
    retrying the same bounded number of times as wait_for_required_cookies,
    with the same sidecar-copying and sqlite3.Error tolerance - a single
    unretried snapshot risks reading before Chromium has flushed the
    openidc cookie, silently resolving 'required' to just cf_clearance and
    letting the caller return as soon as that one cookie shows up."""
    sleep_fn = sleep_fn or time.sleep
    fallback = set(REQUIRED_COOKIE_NAMES_EXACT)
    for attempt in range(1, max_attempts + 1):
        with tempfile.TemporaryDirectory() as tmp:
            try:
                dest_path = _copy_db_with_sidecars(db_path, tmp, _copy_fn=_copy_fn)
                required = _required_names_present(query_cookie_rows(dest_path))
                if required != fallback:
                    return required
            except sqlite3.Error as e:
                print(f"[extract_cookie] resolving required cookie names, attempt {attempt}/{max_attempts}: database error ({e.__class__.__name__})")
        if attempt < max_attempts:
            sleep_fn(delay_s)
    return fallback


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: extract_cookie.py <cookies_db_path> <output_path> [--max-attempts=N] [--delay=S]", file=sys.stderr)
        return 1
    db_path, output_path = argv[0], argv[1]
    max_attempts = 10
    delay_s = 1.0
    for arg in argv[2:]:
        if arg.startswith("--max-attempts="):
            max_attempts = int(arg.split("=", 1)[1])
        elif arg.startswith("--delay="):
            delay_s = float(arg.split("=", 1)[1])

    # Resolves the openidc state cookie's real (random-suffixed) name
    # before starting the retry loop proper - retry-safe and sqlite3.Error
    # tolerant the same way wait_for_required_cookies is, since this reads
    # the same live, possibly mid-write database.
    required = _resolve_required_names(db_path, max_attempts=max_attempts, delay_s=delay_s)

    try:
        rows = wait_for_required_cookies(
            db_path, required, max_attempts=max_attempts, delay_s=delay_s
        )
    except TimeoutError as e:
        print(f"[extract_cookie] {e}", file=sys.stderr)
        return 1

    decrypted = []
    for row in rows:
        try:
            value = decrypt_cookie_value(row["encrypted_value"], row["host_key"])
        except ValueError as e:
            print(f"[extract_cookie] failed to decrypt cookie {row['name']!r}: {e}", file=sys.stderr)
            return 1
        decrypted.append({**row, "value": value})

    header = build_cookie_header(decrypted)
    with open(output_path, "w") as f:
        f.write(header)
    print(f"[extract_cookie] wrote {len(decrypted)} cookies to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
