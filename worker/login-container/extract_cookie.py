#!/usr/bin/env python3
"""Reads Chromium's session cookies for candidat.permisdeconduire.gouv.fr
directly from its on-disk SQLite database, instead of driving Chrome
DevTools via blind pixel-coordinate clicks. See
docs/superpowers/specs/2026-08-12-cookie-extraction-sqlite.md for why.
"""
import hashlib

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA1
from Crypto.Util.Padding import unpad


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
