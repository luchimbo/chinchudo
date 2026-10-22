"""Diagnóstico de colisiones sin relajar la validación de publicación."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import build_landings as bl


class DuplicateDiagnosticsTest(unittest.TestCase):
    def test_reports_original_page_for_each_duplicate_field(self):
        for field in ("slug", "meta_description", "h1"):
            with self.subTest(field=field):
                pages = [
                    {"slug": "primera", field: "Título compartido"},
                    {"slug": "segunda", field: "  TÍTULO COMPARTIDO  "},
                    {"slug": "tercera", field: "Título compartido"},
                ]
                errors = bl.validate_landings(pages, {}, {})
                duplicates = [error for error in errors if f"{field} duplicado" in error]
                self.assertEqual(len(duplicates), 2)
                original = pages[0]["slug"]
                self.assertTrue(all(f"duplicado con {original}" in error for error in duplicates))
                self.assertTrue(all("valor:" in error for error in duplicates))
                self.assertTrue(all("volvé a publicar" in error for error in duplicates))

    def test_different_titles_are_not_reported_as_duplicates(self):
        errors = bl.validate_landings([
            {"slug": "primera", "seo_title": "Rutina de piano en casa"},
            {"slug": "segunda", "seo_title": "Cómo organizar veinte minutos de práctica"},
        ], {}, {})
        self.assertFalse(any("duplicado" in error for error in errors))

    def test_repeated_seo_title_does_not_block_build_or_candidate(self):
        def page(slug, keyword, title):
            return {
                "slug": slug, "keyword": keyword, "intent": "informar",
                "seo_title": title, "h1": f"Encabezado {slug}",
                "meta_description": f"Descripción {slug}", "hero_lede": "Introducción",
                "primary_category_id": "piano", "content_type": "PILLAR",
                "cluster_slug": "piano", "components": [{"cat": "Piano"}],
                "steps": [{"t": "Paso"}], "faqs": [{"q": "Pregunta", "a": "Respuesta"}],
            }

        first = page("pedales", "pedales sostenido", "Piano en casa")
        second = page("rutina", "rutina veinte minutos", "  PIANO EN CASA  ")
        categories = {"piano": {"id": "piano"}}
        self.assertEqual(bl.validate_landings([first, second], categories, {}), [])
        self.assertEqual(bl.validate_editorial_candidate(second, [first], [{"slug": "piano"}], {"piano"}), [])
        second["seo_title"] = ""
        self.assertTrue(any("falta seo_title" in error for error in bl.validate_landings([second], categories, {})))
        self.assertTrue(any("falta seo_title" in error for error in bl.validate_editorial_candidate(second, [first], [{"slug": "piano"}], {"piano"})))


if __name__ == "__main__":
    unittest.main()
