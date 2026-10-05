import * as cheerio from "cheerio";
import type { PageSeo, SeoFinding } from "./business-analysis";

export function inspectPageSeo(html: string, url: string): PageSeo {
  const $ = cheerio.load(html);
  const clean = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 500);
  const findings: SeoFinding[] = [];
  const add = (field: string, evidence: string, recommendation: string) => findings.push({ field, severity: "warning", evidence, recommendation });
  const title = clean($("title").first().text());
  const description = clean($("meta[name='description']").attr("content") || "");
  const h1 = $("h1").toArray().map(n => clean($(n).text()));
  const h2 = $("h2").toArray().map(n => clean($(n).text())).slice(0, 30);
  const robots = $("meta[name='robots']").attr("content") || "";
  const rawCanonical = $("link[rel='canonical']").attr("href") || "";
  let canonical = "";
  if (rawCanonical) try { canonical = new URL(rawCanonical, url).href; } catch { add("canonical", rawCanonical, "Corregir la URL canonical."); }
  const types = new Set<string>(); let malformedStructuredData = false;
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const object = value as Record<string, unknown>;
    const kind = object["@type"];
    for (const type of Array.isArray(kind) ? kind : [kind]) if (typeof type === "string") types.add(type.slice(0, 120));
    Object.values(object).forEach(visit);
  }
  $("script[type='application/ld+json']").each((_, node) => {
    try { visit(JSON.parse($(node).text())); } catch { malformedStructuredData = true; }
  });
  if (!title) add("title", "Sin título HTML", "Agregar un título específico para esta página.");
  if (!description) add("description", "Sin meta description", "Describir el contenido y su utilidad en la descripción.");
  if (h1.length !== 1) add("h1", `${h1.length} encabezados H1`, "Usar un encabezado principal claro.");
  if (!rawCanonical) add("canonical", "Sin canonical declarada", "Revisar si corresponde declarar la URL preferida.");
  if (/noindex/i.test(robots)) findings.push({ field: "robots", severity: "info", evidence: robots, recommendation: "Verificar si la exclusión de indexación es intencional." });
  if (malformedStructuredData) add("structuredData", "JSON-LD inválido", "Corregir el formato del JSON-LD.");
  return { title, description, h1, h2, canonical, robots, structuredTypes: [...types], malformedStructuredData, findings };
}
