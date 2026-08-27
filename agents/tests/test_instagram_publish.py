import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import publisher


def test_meta_publish_uses_human_handoff_without_opening_browser(monkeypatch):
    monkeypatch.setattr(
        publisher.browser_cdp,
        "open_new_tab",
        lambda *args, **kwargs: (_ for _ in ()).throw(AssertionError("No debe abrir navegador")),
    )

    result = publisher.publish_comment(
        "instagram",
        "cuenta-autorizada",
        "https://www.instagram.com/p/example/",
        "Respuesta aprobada",
        dry_run=False,
    )

    assert result["success"] is False
    assert result["error"] == "human_handoff_required"


class FakeClient:
    def send(self, method, params=None):
        assert method == "Page.navigate"


def test_instagram_verification_requires_visible_comment(monkeypatch):
    replies = iter([
        {"confirmed": False, "rejected": False, "textareaCleared": True},
        {"confirmed": True, "rejected": False, "textareaCleared": True},
    ])
    monkeypatch.setattr(publisher.browser_cdp, "evaluate", lambda client, js: next(replies))
    monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)

    result = publisher._instagram_verify_comment(object(), "Comentario de prueba", attempts=2)

    assert result["confirmed"] is True


def test_instagram_verification_stops_on_rejection(monkeypatch):
    monkeypatch.setattr(
        publisher.browser_cdp,
        "evaluate",
        lambda client, js: {"confirmed": False, "rejected": True, "textareaChars": 20},
    )

    result = publisher._instagram_verify_comment(object(), "Comentario de prueba")

    assert result["rejected"] is True
    assert result["confirmed"] is False


def test_instagram_verification_does_not_accept_cleared_textarea(monkeypatch):
    monkeypatch.setattr(
        publisher.browser_cdp,
        "evaluate",
        lambda client, js: {"confirmed": False, "rejected": False, "textareaCleared": True},
    )
    monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)

    result = publisher._instagram_verify_comment(object(), "Comentario de prueba", attempts=2)

    assert result["confirmed"] is False


def test_instagram_existing_comment_prevents_second_submission(monkeypatch):
    monkeypatch.setattr(publisher.time, "sleep", lambda seconds: None)
    monkeypatch.setattr(publisher, "_poll_login", lambda client, js: {"loggedIn": True})
    monkeypatch.setattr(
        publisher,
        "_instagram_verify_comment",
        lambda client, text, attempts=8, interval=1.5: {"confirmed": True},
    )

    result = publisher.post_instagram_comment(
        FakeClient(),
        "https://www.instagram.com/p/example/",
        "Que bueno que esta!",
        dry_run=False,
    )

    assert result == {
        "success": True,
        "url": "https://www.instagram.com/p/example/",
        "verified": True,
        "already_exists": True,
        "published_now": False,
    }
