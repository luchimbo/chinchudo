import json
import sys
import unittest
import subprocess
from tempfile import TemporaryDirectory
from pathlib import Path
from unittest.mock import patch


AGENTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENTS_DIR))

import listening_connectors


class SearchBudgetTests(unittest.TestCase):
    def test_releases_lock_and_keeps_cooldown_after_a_failed_request(self):
        with TemporaryDirectory() as directory:
            lock = Path(directory) / "search.lock"
            with patch.object(listening_connectors, "SEARCH_LOCK_PATH", lock), patch.object(listening_connectors, "_request", side_effect=OSError("connection refused")), patch.object(listening_connectors.time, "sleep") as sleep, patch.dict(listening_connectors.os.environ, {"SEARXNG_REQUEST_INTERVAL_SEC": "2"}):
                with self.assertRaises(OSError):
                    listening_connectors._search_request("http://localhost/search", "application/json")
            self.assertFalse(lock.exists())
            self.assertGreater(sleep.call_args.args[0], 0)

    def test_busy_budget_never_sends_a_second_request(self):
        with TemporaryDirectory() as directory:
            lock = Path(directory) / "search.lock"
            lock.write_text("busy")
            with patch.object(listening_connectors, "SEARCH_LOCK_PATH", lock), patch.object(listening_connectors.time, "monotonic", side_effect=[0, 36]), patch.object(listening_connectors, "_request") as request:
                with self.assertRaises(TimeoutError):
                    listening_connectors._search_request("http://localhost/search", "application/json")
            request.assert_not_called()
            self.assertTrue(lock.exists())


class SearxngDiscoveryTests(unittest.TestCase):
    def test_uses_flat_site_filter_and_keeps_only_actionable_social_urls(self):
        calls = []

        def fake_request(url, _accept):
            calls.append(url)
            return json.dumps({
                "results": [
                    {
                        "url": "https://www.instagram.com/corro_arg/",
                        "title": "Perfil de running",
                        "content": "Perfil general de running de Argentina",
                    },
                    {
                        "url": "https://www.instagram.com/reel/ABC123/",
                        "title": "Consejos para correr",
                        "content": "Consejos para correr sin rozaduras durante el entrenamiento",
                    },
                ],
            }).encode()

        with patch.object(listening_connectors, "_search_request", fake_request):
            items, health = listening_connectors.discover_searxng("instagram", "running argentina", 5)

        self.assertEqual(health["status"], "ok")
        self.assertEqual([item["url"] for item in items], ["https://www.instagram.com/reel/ABC123/"])
        self.assertIn("site%3Ainstagram.com%20", calls[0])
        self.assertNotIn("%28site%3A", calls[0])
        self.assertNotIn("language=es-AR", calls[0])

    def test_rejects_profile_pages_for_x(self):
        self.assertFalse(listening_connectors._valid_social_result("x", "https://x.com/prestige"))
        self.assertTrue(listening_connectors._valid_social_result("x", "https://x.com/prestige/status/123"))

    def test_retries_only_a_transient_timeout(self):
        responses = iter([
            {"results": [], "unresponsive_engines": [["duckduckgo", "timeout"]]},
            {"results": [{"url": "https://www.youtube.com/watch?v=abc", "title": "Controlador MIDI para home studio", "content": "Comparativa práctica de controladores MIDI para producir en casa."}]},
        ])
        with patch.object(listening_connectors, "_search_request", side_effect=lambda *_args: json.dumps(next(responses)).encode()), \
             patch.object(listening_connectors.time, "sleep"):
            items, health = listening_connectors.discover_searxng("youtube", "controlador MIDI", 5)

        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["retry_attempted"], 1)
        self.assertEqual(len(items), 1)

    def test_timeout_retry_excludes_captcha_and_suspended_engines(self):
        responses = [
            {"results": [], "unresponsive_engines": [["bing", "timeout"], ["brave", "Suspended: timeout"], ["google", "CAPTCHA"]]},
            {"results": [], "unresponsive_engines": []},
        ]
        with patch.object(listening_connectors, "_search_request", side_effect=[json.dumps(p).encode() for p in responses]) as request, patch.object(listening_connectors.time, "sleep"):
            _items, health = listening_connectors.discover_searxng("reddit", "MIDI", 5)
        self.assertIn("engines=bing", request.call_args_list[1].args[0])
        self.assertNotIn("brave", request.call_args_list[1].args[0])
        self.assertEqual(health["status"], "degraded")
        self.assertIn("CAPTCHA", health["error"])

    def test_failed_retry_preserves_results_from_first_response(self):
        initial = {"results": [{"url": "https://reddit.com/r/midi/comments/abc/help", "title": "Consulta sobre controlador MIDI", "content": "Cómo conectar el controlador MIDI al DAW"}], "unresponsive_engines": [["bing", "timeout"]]}
        with patch.object(listening_connectors, "_search_request", side_effect=[json.dumps(initial).encode(), OSError("connection lost")]), patch.object(listening_connectors.time, "sleep"):
            items, health = listening_connectors.discover_searxng("reddit", "MIDI", 5)
        self.assertEqual(len(items), 1)
        self.assertEqual(health["status"], "ok")

    def test_empty_success_does_not_become_an_error(self):
        with patch.object(listening_connectors, "_search_request", return_value=b'{"results": [], "unresponsive_engines": []}'):
            items, health = listening_connectors.discover_searxng("facebook", "MIDI", 5)
        self.assertEqual(items, [])
        self.assertEqual(health["status"], "ok")


class RecoveryTests(unittest.TestCase):
    def test_starts_stopped_docker_desktop_before_retrying_compose(self):
        initial = [{"name": "searxng", "status": "unavailable"}, {"name": "rsshub", "status": "ok"}]
        final = [{"name": "searxng", "status": "ok"}, {"name": "rsshub", "status": "ok"}]
        with patch.object(listening_connectors, "_probe_service", side_effect=initial + final), patch.object(listening_connectors.shutil, "which", return_value="docker"), patch.object(listening_connectors.os, "name", "nt"), patch.object(listening_connectors.subprocess, "run", side_effect=[
            subprocess.CompletedProcess([], 1, "", "error during connect: dockerDesktopLinuxEngine"),
            subprocess.CompletedProcess([], 0, "started", ""),
            subprocess.CompletedProcess([], 0, "", ""),
        ]) as run:
            result = listening_connectors.recover_local_services()
        self.assertEqual(run.call_args_list[1].args[0][1:3], ["desktop", "start"])
        self.assertEqual(result["recovered"], ["searxng"])

    def test_does_not_start_desktop_for_an_invalid_compose_configuration(self):
        with patch.object(listening_connectors, "_probe_service", side_effect=[{"name": "searxng", "status": "unavailable"}, {"name": "rsshub", "status": "ok"}]), patch.object(listening_connectors.shutil, "which", return_value="docker"), patch.object(listening_connectors.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, "", "invalid compose file")) as run:
            result = listening_connectors.recover_local_services()
        self.assertEqual(run.call_count, 1)
        self.assertIn("invalid compose", result["error"])

    def test_recovers_only_unavailable_service(self):
        probes = iter([
            {"name": "searxng", "status": "unavailable", "url": "http://test/healthz"},
            {"name": "rsshub", "status": "ok", "url": "http://test"},
            {"name": "searxng", "status": "ok", "url": "http://test/healthz"},
            {"name": "rsshub", "status": "ok", "url": "http://test"},
        ])
        with patch.object(listening_connectors, "_probe_service", side_effect=lambda _name: next(probes)), \
             patch.object(listening_connectors.shutil, "which", return_value="docker"), \
             patch.object(listening_connectors.subprocess, "run") as run, \
             patch.object(listening_connectors.time, "sleep"):
            run.return_value.returncode = 0
            result = listening_connectors.recover_local_services()

        self.assertTrue(result["attempted"])
        self.assertEqual(result["recovered"], ["searxng"])
        self.assertIn("searxng", run.call_args.args[0])
        self.assertNotIn("rsshub", run.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
