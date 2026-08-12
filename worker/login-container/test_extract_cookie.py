import hashlib
import sqlite3
import tempfile
import os
import shutil

from Crypto.Cipher import AES
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Hash import SHA1

from extract_cookie import decrypt_cookie_value, query_cookie_rows, build_cookie_header, wait_for_required_cookies


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


def _make_test_db(path, rows):
    conn = sqlite3.connect(path)
    conn.execute(
        """CREATE TABLE cookies(
            creation_utc INTEGER NOT NULL, host_key TEXT NOT NULL,
            name TEXT NOT NULL, encrypted_value BLOB NOT NULL,
            path TEXT NOT NULL
        )"""
    )
    for row in rows:
        conn.execute(
            "INSERT INTO cookies (creation_utc, host_key, name, encrypted_value, path) VALUES (?, ?, ?, ?, ?)",
            row,
        )
    conn.commit()
    conn.close()


def test_query_cookie_rows_filters_by_host_and_path():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "Cookies")
        _make_test_db(
            db_path,
            [
                (100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/"),
                (200, ".permisdeconduire.gouv.fr", "cf_clearance", b"v10BBBB", "/"),
                (300, "moncompte.permisdeconduire.gouv.fr", "AUTH_SESSION_ID", b"v10CCCC", "/auth/realms/usager/"),
                (400, ".moncompte.permisdeconduire.gouv.fr", "TC_PRIVACY", b"v10DDDD", "/"),
            ],
        )
        rows = query_cookie_rows(db_path)
        names = {r["name"] for r in rows}
        assert names == {"mod_auth_openidc_state_x", "cf_clearance"}


def test_build_cookie_header_orders_by_path_length_then_creation_time():
    cookies = [
        {"name": "short_path_newer", "value": "v1", "path": "/", "creation_utc": 200},
        {"name": "short_path_older", "value": "v2", "path": "/", "creation_utc": 100},
        {"name": "long_path", "value": "v3", "path": "/auth/realms/usager/", "creation_utc": 300},
    ]
    result = build_cookie_header(cookies)
    assert result == "long_path=v3; short_path_older=v2; short_path_newer=v1"


def test_build_cookie_header_empty_list():
    assert build_cookie_header([]) == ""


def test_wait_for_required_cookies_retries_until_present():
    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "Cookies")
        _make_test_db(
            source_path,
            [(100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/")],
        )

        call_count = {"n": 0}

        def fake_copy(src, dst):
            call_count["n"] += 1
            if call_count["n"] >= 3:
                # Simulate Chromium finishing its write on the 3rd attempt.
                _make_test_db(
                    dst,
                    [
                        (100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/"),
                        (200, ".permisdeconduire.gouv.fr", "cf_clearance", b"v10BBBB", "/"),
                    ],
                )
            else:
                shutil.copy(src, dst)

        rows = wait_for_required_cookies(
            source_path,
            {"mod_auth_openidc_state_x", "cf_clearance"},
            max_attempts=10,
            sleep_fn=lambda s: None,
            _copy_fn=fake_copy,
        )
        names = {r["name"] for r in rows}
        assert names == {"mod_auth_openidc_state_x", "cf_clearance"}
        assert call_count["n"] == 3


def test_wait_for_required_cookies_times_out():
    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "Cookies")
        _make_test_db(
            source_path,
            [(100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/")],
        )
        try:
            wait_for_required_cookies(
                source_path,
                {"mod_auth_openidc_state_x", "cf_clearance"},
                max_attempts=3,
                sleep_fn=lambda s: None,
            )
            assert False, "expected TimeoutError"
        except TimeoutError as e:
            assert "cf_clearance" in str(e)


def test_wait_for_required_cookies_handles_malformed_db():
    """Regression test: torn copy (Chromium mid-write) should retry,
    not crash with unhandled sqlite3.DatabaseError."""
    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "Cookies")
        # Create a malformed file (simulates torn copy)
        with open(source_path, "wb") as f:
            f.write(b"corrupted data " * 10)

        call_count = {"n": 0}

        def fake_copy(src, dst):
            call_count["n"] += 1
            if call_count["n"] >= 2:
                # Simulate recovery on 2nd attempt - write a valid database
                _make_test_db(
                    dst,
                    [
                        (100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/"),
                        (200, ".permisdeconduire.gouv.fr", "cf_clearance", b"v10BBBB", "/"),
                    ],
                )
            else:
                shutil.copy(src, dst)

        # Should NOT crash with unhandled sqlite3.Error - should retry and succeed
        rows = wait_for_required_cookies(
            source_path,
            {"mod_auth_openidc_state_x", "cf_clearance"},
            max_attempts=5,
            sleep_fn=lambda s: None,
            _copy_fn=fake_copy,
        )
        names = {r["name"] for r in rows}
        assert names == {"mod_auth_openidc_state_x", "cf_clearance"}
        assert call_count["n"] == 2


def test_wait_for_required_cookies_clears_stale_error_state():
    """Regression test: if attempt 1 raises sqlite3.Error but attempt 2+
    read the DB cleanly (but cookies are missing), the final TimeoutError
    should report missing cookie names, not the stale attempt-1 error."""
    with tempfile.TemporaryDirectory() as tmp:
        source_path = os.path.join(tmp, "Cookies")
        _make_test_db(
            source_path,
            [(100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/")],
        )

        call_count = {"n": 0}

        def fake_copy(src, dst):
            call_count["n"] += 1
            if call_count["n"] == 1:
                # Simulate torn copy on first attempt
                raise sqlite3.DatabaseError("file is not a database")
            else:
                # Subsequent attempts: copy the real (but incomplete) DB
                shutil.copy(src, dst)

        try:
            wait_for_required_cookies(
                source_path,
                {"mod_auth_openidc_state_x", "cf_clearance"},
                max_attempts=3,
                sleep_fn=lambda s: None,
                _copy_fn=fake_copy,
            )
            assert False, "expected TimeoutError"
        except TimeoutError as e:
            error_msg = str(e)
            # Should report missing cookie names, not the stale database error
            assert "cf_clearance" in error_msg
            assert "DatabaseError" not in error_msg
            assert "database error" not in error_msg.lower()


def test_main_writes_cookie_header_on_success():
    from extract_cookie import main

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "Cookies")
        out_path = os.path.join(tmp, "cookie.txt")
        rows = []
        for name, host_key in [
            ("mod_auth_openidc_state_x", "candidat.permisdeconduire.gouv.fr"),
            ("cf_clearance", ".permisdeconduire.gouv.fr"),
        ]:
            encrypted = _encrypt_for_test(f"val_{name}".encode(), host_key)
            rows.append((100, host_key, name, encrypted, "/"))
        _make_test_db(db_path, rows)

        exit_code = main([db_path, out_path])

        assert exit_code == 0
        with open(out_path) as f:
            content = f.read()
        assert "mod_auth_openidc_state_x=val_mod_auth_openidc_state_x" in content
        assert "cf_clearance=val_cf_clearance" in content


def test_main_fails_when_required_cookie_missing():
    from extract_cookie import main

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "Cookies")
        out_path = os.path.join(tmp, "cookie.txt")
        _make_test_db(
            db_path,
            [(100, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x", b"v10AAAA", "/")],
        )

        exit_code = main([db_path, out_path, "--max-attempts=1", "--delay=0"])

        assert exit_code == 1
        assert not os.path.exists(out_path)


def test_resolve_required_names_waits_for_openidc_cookie():
    from extract_cookie import _resolve_required_names

    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "Cookies")
        partial_path = os.path.join(tmp, "partial")
        full_path = os.path.join(tmp, "full")
        _make_test_db(partial_path, [
            (100, ".permisdeconduire.gouv.fr", "cf_clearance",
             _encrypt_for_test(b"val", ".permisdeconduire.gouv.fr"), "/"),
        ])
        _make_test_db(full_path, [
            (100, ".permisdeconduire.gouv.fr", "cf_clearance",
             _encrypt_for_test(b"val", ".permisdeconduire.gouv.fr"), "/"),
            (200, "candidat.permisdeconduire.gouv.fr", "mod_auth_openidc_state_x",
             _encrypt_for_test(b"val2", "candidat.permisdeconduire.gouv.fr"), "/"),
        ])

        calls = {"n": 0}

        def fake_copy(src, dst):
            calls["n"] += 1
            source = partial_path if calls["n"] < 3 else full_path
            shutil.copy(source, dst)

        required = _resolve_required_names(
            db_path, max_attempts=5, delay_s=0, sleep_fn=lambda s: None, _copy_fn=fake_copy
        )

        assert required == {"cf_clearance", "mod_auth_openidc_state_x"}
