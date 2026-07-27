import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


AGENTS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AGENTS_DIR))

import listening_connectors


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

        with patch.object(listening_connectors, "_request", fake_request):
            items, health = listening_connectors.discover_searxng("instagram", "running argentina", 5)

        self.assertEqual(health["status"], "ok")
        self.assertEqual([item["url"] for item in items], ["https://www.instagram.com/reel/ABC123/"])
        self.assertIn("site%3Ainstagram.com/reel", calls[0])
        self.assertNotIn("%28site%3A", calls[0])
        self.assertNotIn("language=es-AR", calls[0])

    def test_rejects_profile_pages_for_x(self):
        self.assertFalse(listening_connectors._valid_social_result("x", "https://x.com/prestige"))
        self.assertTrue(listening_connectors._valid_social_result("x", "https://x.com/prestige/status/123"))


class RecoveryTests(unittest.TestCase):
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
