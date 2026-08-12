#!/usr/bin/env python3
"""Reads Chromium's session cookies for candidat.permisdeconduire.gouv.fr
directly from its on-disk SQLite database, instead of driving Chrome
DevTools via blind pixel-coordinate clicks. See
docs/superpowers/specs/2026-08-12-cookie-extraction-sqlite.md for why.
"""
import hashlib
import sqlite3

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
