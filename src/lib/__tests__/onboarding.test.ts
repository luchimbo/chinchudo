import { describe, expect, it } from "vitest";
import { assertPublicUrl, generatedKnowledge, mergeManualFields, normalizeWebsiteUrl, sanitizeDraft } from "@/lib/onboarding";

describe("onboarding", () => {
  it("normaliza listas y evita aprobar conocimientos incompletos", () => {
    const draft = sanitizeDraft({ name: "Marca", topics: ["uno", 2, "dos"], knowledge: ["A"] }, "Cliente");
    expect(draft.topics).toEqual(["uno", "dos"]);
    expect(draft.knowledge).toHaveLength(3);
  });

  it("genera conocimiento desde la información aprobada", () => {
    const draft = sanitizeDraft({ brand: "Casa Norte", offer: "asesoramiento", topics: ["compra informada"] });
    expect(generatedKnowledge(draft, "Problema que resolvemos")).toContain("Casa Norte");
  });

  it("conserva productos y servicios revisables con su procedencia", () => {
    const draft = sanitizeDraft({
      offerings: [
        { kind: "product", name: "Controlador", selected: true, evidence: { url: "https://tienda.test/p/1", status: "extracted", confidence: "high" } },
        { kind: "service", name: "Asesoramiento", selected: true, evidence: { url: "https://tienda.test/servicios", status: "manual", confidence: "high" } },
      ],
    });
    expect(draft.offerings.map((item) => item.kind)).toEqual(["product", "service"]);
    expect(draft.offerings[1].evidence.status).toBe("manual");
  });

  it("bloquea URLs internas antes de consultar la red", async () => {
    await expect(assertPublicUrl("http://127.0.0.1:3000/admin")).rejects.toThrow("direcciones internas");
  });

  it("agrega HTTPS cuando se pega solo el dominio", () => {
    expect(normalizeWebsiteUrl(" pcmidi.com.ar ")).toBe("https://pcmidi.com.ar");
    expect(normalizeWebsiteUrl("http://pcmidi.com.ar")).toBe("http://pcmidi.com.ar");
  });

  it("no convierte otros protocolos en direcciones web", () => {
    expect(normalizeWebsiteUrl("ftp://archivos.ejemplo.com")).toBe("ftp://archivos.ejemplo.com");
  });

  it("conserva un campo manual de nivel superior al reanalizar", () => {
    const previous = sanitizeDraft({
      brand: "Marca editada a mano",
      manualFields: ["brand"],
      evidence: { brand: { url: "https://tienda.test", status: "manual", confidence: "high" } },
    });
    const fresh = sanitizeDraft({ brand: "Marca detectada de nuevo" });
    const merged = mergeManualFields(fresh, previous);
    expect(merged.brand).toBe("Marca editada a mano");
    expect(merged.evidence.brand?.status).toBe("manual");
  });

  it("conserva una oferta agregada a mano que ya no está en el sitio", () => {
    const previous = sanitizeDraft({
      offerings: [
        { id: "manual-1", kind: "service", name: "Asesoramiento a medida", selected: true, evidence: { url: "https://tienda.test", status: "manual", confidence: "high" } },
      ],
    });
    const fresh = sanitizeDraft({ offerings: [] });
    const merged = mergeManualFields(fresh, previous);
    expect(merged.offerings.map((item) => item.id)).toEqual(["manual-1"]);
  });

  it("prioriza la edición manual de una oferta sobre el dato recién extraído con el mismo id", () => {
    const previous = sanitizeDraft({
      offerings: [
        { id: "https://tienda.test/p/1", kind: "product", name: "Controlador editado", price: "$100.000", selected: true, evidence: { url: "https://tienda.test/p/1", status: "manual", confidence: "high" } },
      ],
    });
    const fresh = sanitizeDraft({
      offerings: [
        { id: "https://tienda.test/p/1", kind: "product", name: "Controlador", price: "$90.000", selected: true, evidence: { url: "https://tienda.test/p/1", status: "extracted", confidence: "high" } },
      ],
    });
    const merged = mergeManualFields(fresh, previous);
    expect(merged.offerings).toHaveLength(1);
    expect(merged.offerings[0].name).toBe("Controlador editado");
    expect(merged.offerings[0].price).toBe("$100.000");
  });
});
