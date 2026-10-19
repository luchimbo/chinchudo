import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import _browser


def test_null_running_list_does_not_prevent_start(monkeypatch):
    monkeypatch.setenv("NSTBROWSER_API_KEY", "test")
    calls = []

    def request(url, method="GET", data=None):
        calls.append(method)
        return {"data": None} if method == "GET" else {"data": {"port": 9222}}

    monkeypatch.setattr(_browser, "nstbrowser_request", request)
    monkeypatch.setattr(_browser, "save_runtime_for", lambda *_: None)
    result = _browser.start_nstbrowser_profile({"id": "kressmer-early", "nstbrowserProfileId": "test-profile"})
    assert result["cdp_url"] == "http://127.0.0.1:9222"
    assert calls == ["GET", "POST"]
