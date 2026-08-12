#!/usr/bin/env python3
"""Reads the 6-digit email verification code the government site now
requires during login, from an Ionos mailbox the account's real address
forwards to. See
docs/superpowers/specs/2026-08-12-login-2fa-email-code-design.md for why.
"""
import email
import imaplib
import os
import re
import sys
import time


CODE_PATTERN = re.compile(r"\b\d{6}\b")


def extract_code_from_body(body: str) -> str:
    """Finds an isolated 6-digit code in an email body. Raises ValueError
    if none is found, or if the body contains more than one distinct
    6-digit number - ambiguous, can't tell which one is the real code."""
    matches = CODE_PATTERN.findall(body)
    unique = set(matches)
    if not unique:
        raise ValueError("no 6-digit code found in email body")
    if len(unique) > 1:
        raise ValueError(
            f"ambiguous: found multiple distinct 6-digit numbers {sorted(unique)}"
        )
    return matches[0]


def _get_text_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    return payload.decode(errors="replace")
        return ""
    payload = msg.get_payload(decode=True)
    return payload.decode(errors="replace") if payload else ""


def find_new_code(conn, since_uid: int) -> str | None:
    """Searches INBOX for a message with UID greater than since_uid via
    UID SEARCH (not sequence-number SEARCH, so the watermark stays valid
    even if messages are deleted/expunged between polls). Returns the
    extracted code from the newest such message, or None if nothing new
    has arrived yet."""
    typ, data = conn.uid("search", None, f"UID {since_uid + 1}:*")
    if typ != "OK" or not data or not data[0]:
        return None
    uids = [u for u in data[0].split() if int(u) > since_uid]
    if not uids:
        return None
    newest = uids[-1]
    typ, msg_data = conn.uid("fetch", newest, "(RFC822)")
    if typ != "OK" or not msg_data or not msg_data[0]:
        return None
    msg = email.message_from_bytes(msg_data[0][1])
    body = _get_text_body(msg)
    return extract_code_from_body(body)


def get_current_max_uid(conn) -> int:
    typ, data = conn.uid("search", None, "ALL")
    if typ != "OK" or not data or not data[0]:
        return 0
    uids = data[0].split()
    return int(uids[-1]) if uids else 0


def get_watermark(host: str, user: str, password: str, *, imap_factory=imaplib.IMAP4_SSL) -> int:
    """Connects and records the mailbox's current highest UID, without
    waiting for anything. Meant to be called as early as possible in the
    login flow - see wait_for_code's since_uid parameter for why."""
    conn = imap_factory(host, 993)
    try:
        conn.login(user, password)
        conn.select("INBOX")
        return get_current_max_uid(conn)
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def wait_for_code(
    host: str,
    user: str,
    password: str,
    *,
    since_uid: int | None = None,
    max_wait_s: float = 240.0,
    poll_interval_s: float = 5.0,
    sleep_fn=None,
    imap_factory=imaplib.IMAP4_SSL,
) -> str:
    """Polls for a message with UID greater than since_uid. If since_uid
    is None, records the mailbox's current highest UID at call time
    (original behavior) - but that's late: a real run showed the
    verification email can arrive within ~10s of form submission, well
    before this function itself gets invoked several script-seconds
    later, causing a false "never arrived" timeout even though the email
    was already there. Pass an explicit since_uid (from a call to
    get_watermark made as early as possible, before the login flow
    starts) to avoid this - this now means only messages that arrive
    after login started are ever considered, not just after this
    function was called."""
    sleep_fn = sleep_fn or time.sleep
    conn = imap_factory(host, 993)
    try:
        conn.login(user, password)
        conn.select("INBOX")
        watermark = since_uid if since_uid is not None else get_current_max_uid(conn)
        elapsed = 0.0
        while elapsed <= max_wait_s:
            code = find_new_code(conn, watermark)
            if code is not None:
                return code
            sleep_fn(poll_interval_s)
            elapsed += poll_interval_s
        raise TimeoutError(
            f"no verification code email arrived within {max_wait_s:.0f}s"
        )
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def main(argv: list[str]) -> int:
    host = os.environ.get("IONOS_IMAP_HOST", "imap.ionos.fr")
    user = os.environ.get("IONOS_IMAP_USER", "no-reply@killianjourdan.com")
    password = os.environ.get("IONOS_IMAP_PASSWORD")
    if not password:
        print("[read_verification_code] IONOS_IMAP_PASSWORD not set", file=sys.stderr)
        return 1

    if argv and argv[0] == "--get-watermark":
        try:
            uid = get_watermark(host, user, password)
        except imaplib.IMAP4.error as e:
            print(f"[read_verification_code] {e}", file=sys.stderr)
            return 1
        print(uid)
        return 0

    since_uid = None
    for arg in argv:
        if arg.startswith("--since-uid="):
            since_uid = int(arg.split("=", 1)[1])

    try:
        code = wait_for_code(host, user, password, since_uid=since_uid)
    except (TimeoutError, imaplib.IMAP4.error, ValueError) as e:
        print(f"[read_verification_code] {e}", file=sys.stderr)
        return 1
    print(code)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
