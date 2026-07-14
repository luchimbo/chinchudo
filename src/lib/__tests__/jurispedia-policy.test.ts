import { describe, expect, it } from "vitest";
import { buildJurispediaCta, classifyJurispediaSafety, makeJurispediaDrafts } from "../jurispedia-policy";

describe("política Jurispedia", () => {
  it("clasifica una consulta pública laboral como apta", () => {
    const result = classifyJurispediaSafety("Me despidieron sin causa, ¿dónde puedo buscar fallos similares?");
    expect(result).toMatchObject({ allowed: true, category: "laboral" });
  });

  it.each([
    "Es urgente, necesito resolver esto hoy",
    "Mi ex me amenazó, ¿qué hago?",
    "Tengo una causa penal y una citación de fiscalía",
    "Este es mi DNI 12345678, necesito ayuda",
  ])("excluye contenido riesgoso: %s", (text) => {
    expect(classifyJurispediaSafety(text).allowed).toBe(false);
  });

  it("construye CTA con UTM sin copiar el texto de origen", () => {
    const url = new URL(buildJurispediaCta("alquileres", "Reddit", "opp_123"));
    expect(url.origin).toBe("https://www.jurispedia.com.ar");
    expect(url.searchParams.get("utm_source")).toBe("reddit");
    expect(url.searchParams.get("utm_content")).toBe("opp_123");
  });

  it("genera borradores prudentes sin asesoramiento ni datos personales", () => {
    const drafts = makeJurispediaDrafts({ text: "¿Qué fallos hay sobre alquileres?", channel: "Facebook", opportunityId: "opp_123" });
    expect(drafts).toHaveLength(3);
    const content = drafts.map((draft) => `${draft.draftText} ${draft.riskNotes}`).join(" ").toLowerCase();
    expect(content).toContain("fuente oficial");
    expect(content).toContain("no asesoramiento legal");
  });
});
