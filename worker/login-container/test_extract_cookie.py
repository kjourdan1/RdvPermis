import hashlib

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA1

from extract_cookie import decrypt_cookie_value


def _encrypt_for_test(plaintext: bytes, host_key: str) -> bytes:
    """Mirrors Chromium's Linux v10 cookie encryption so tests can build
    known-good fixtures without a real browser. Independent of
    decrypt_cookie_value's own implementation below - this must derive
    the key/IV/padding the same documented way, not call into the code
    under test."""
    key = PBKDF2(b"peanuts", b"saltysalt", dkLen=16, count=1, hmac_hash_module=SHA1)
    iv = b" " * 16
    prefixed = hashlib.sha256(host_key.encode()).digest() + plaintext
    pad_len = 16 - (len(prefixed) % 16)
    padded = prefixed + bytes([pad_len]) * pad_len
    cipher = AES.new(key, AES.MODE_CBC, iv)
    return b"v10" + cipher.encrypt(padded)


def test_decrypt_cookie_value_roundtrip():
    host_key = "candidat.permisdeconduire.gouv.fr"
    encrypted = _encrypt_for_test(b"abc123session", host_key)
    assert decrypt_cookie_value(encrypted, host_key) == "abc123session"


def test_decrypt_cookie_value_wrong_prefix_raises():
    try:
        decrypt_cookie_value(b"v11notarealprefix", "example.com")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "v10" in str(e)


def test_decrypt_cookie_value_empty_value():
    host_key = ".permisdeconduire.gouv.fr"
    encrypted = _encrypt_for_test(b"", host_key)
    assert decrypt_cookie_value(encrypted, host_key) == ""
