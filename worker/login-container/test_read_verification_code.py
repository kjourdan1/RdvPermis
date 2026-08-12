from email.message import EmailMessage

from read_verification_code import (
    extract_code_from_body,
    wait_for_code,
)


def test_extract_code_from_body_finds_isolated_six_digits():
    body = "Bonjour,\n\nVotre code de sécurité est : 482913\n\nCe code est valable 15 minutes."
    assert extract_code_from_body(body) == "482913"


def test_extract_code_from_body_raises_when_missing():
    try:
        extract_code_from_body("Pas de code ici.")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "no 6-digit code" in str(e)


def test_extract_code_from_body_raises_when_ambiguous():
    try:
        extract_code_from_body("Code: 111111. Reference: 222222.")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "ambiguous" in str(e)


class FakeIMAPConnection:
    """Minimal stand-in for imaplib.IMAP4_SSL supporting only the uid()
    search/fetch calls read_verification_code.py actually uses - not a
    general-purpose IMAP mock."""

    def __init__(self, messages: dict[int, bytes]):
        self._messages = messages

    def login(self, user, password):
        return "OK", [b"Logged in"]

    def select(self, mailbox):
        return "OK", [b"1"]

    def uid(self, command, *args):
        if command == "search":
            criteria = args[1]
            if criteria == "ALL":
                matching = sorted(self._messages.keys())
            else:
                start = int(criteria.split(" ")[1].split(":")[0])
                matching = sorted(u for u in self._messages if u >= start)
            return "OK", [" ".join(str(u) for u in matching).encode()]
        if command == "fetch":
            uid = int(args[0])
            if uid not in self._messages:
                return "NO", [None]
            return "OK", [(b"1 (RFC822 {n}", self._messages[uid])]
        return "NO", [None]

    def logout(self):
        return "BYE", [b"Logging out"]


def _make_email(body: str) -> bytes:
    msg = EmailMessage()
    msg["From"] = "no-reply@permisdeconduire.gouv.fr"
    msg["Subject"] = "Votre code de sécurité"
    msg.set_content(body)
    return msg.as_bytes()


def test_wait_for_code_returns_code_from_new_message():
    conn = FakeIMAPConnection({1: _make_email("ancien code: 000000")})

    def fake_sleep(_):
        conn._messages[2] = _make_email("Votre code: 654321")

    code = wait_for_code(
        "imap.example.com", "user", "pw",
        max_wait_s=10, poll_interval_s=1,
        sleep_fn=fake_sleep, imap_factory=lambda h, p: conn,
    )
    assert code == "654321"


def test_wait_for_code_times_out_when_nothing_new_arrives():
    conn = FakeIMAPConnection({1: _make_email("code: 000000")})
    try:
        wait_for_code(
            "imap.example.com", "user", "pw",
            max_wait_s=2, poll_interval_s=1,
            sleep_fn=lambda s: None, imap_factory=lambda h, p: conn,
        )
        assert False, "expected TimeoutError"
    except TimeoutError:
        pass
