import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import publisher


class FakeClient:
    def __init__(self, cookies=None):
        self.cookies = cookies or []

    def send(self, method, params=None):
        assert method == "Network.getCookies"
        return {"cookies": self.cookies}


def test_reddit_login_accepts_dom_logout_signal(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_poll_login",
        lambda client, js: {"loggedIn": True, "domSignal": "logout_control", "url": "https://old.reddit.com/"},
    )
    assert publisher._reddit_login_status(FakeClient())["loggedIn"] is True


def test_reddit_login_falls_back_to_http_only_session_cookie(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_poll_login",
        lambda client, js: {"loggedIn": False, "onLoginPage": False, "url": "https://old.reddit.com/"},
    )
    status = publisher._reddit_login_status(FakeClient([{"name": "reddit_session"}]))
    assert status["loggedIn"] is True
    assert status["cookieSignal"] == "reddit_session"


def test_reddit_login_page_overrides_stale_cookie(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_poll_login",
        lambda client, js: {"loggedIn": False, "onLoginPage": True, "url": "https://www.reddit.com/login/"},
    )
    status = publisher._reddit_login_status(FakeClient([{"name": "reddit_session"}]))
    assert status["loggedIn"] is False


def test_reddit_login_rejects_missing_signals(monkeypatch):
    monkeypatch.setattr(
        publisher,
        "_poll_login",
        lambda client, js: {"loggedIn": False, "onLoginPage": False, "url": "https://old.reddit.com/"},
    )
    assert publisher._reddit_login_status(FakeClient())["loggedIn"] is False
