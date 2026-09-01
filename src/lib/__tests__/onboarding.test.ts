import { describe, expect, it } from "vitest";
import { assertPublicUrl, cleanBusinessSummary, fillOnboardingDraftGaps, generatedKnowledge, isGenericOfferingName, mergeManualFields, sanitizeDraft } from "@/lib/onboarding";
import { getOnboardingCompletionIssues } from "@/lib/onboarding-completion";
import { normalizeWebsiteUrl } from "@/lib/website-url";

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

  it("completa una propuesta útil sin IA cuando el sitio aporta contexto", () => {
    const draft = fillOnboardingDraftGaps({
      name: "Prestige Running",
      brand: "Prestige Running",
      description: "Tienda online de medias técnicas para correr.",
      offer: "Medias técnicas para running",
    }, "https://prestige.test");
    expect(getOnboardingCompletionIssues(draft)).toEqual([]);
    expect(draft.targetAudience).toContain("Medias técnicas para running");
    expect(draft.knowledge.every(Boolean)).toBe(true);
  });

  it("deja pendiente sólo lo que no tiene contexto suficiente", () => {
    const draft = fillOnboardingDraftGaps({ name: "Marca", brand: "Marca" });
    expect(getOnboardingCompletionIssues(draft).map((issue) => issue.key)).toContain("offer");
    expect(getOnboardingCompletionIssues(draft).map((issue) => issue.key)).toContain("knowledge-0");
  });

  it("no agrega claims sensibles al completar los huecos", () => {
    const draft = fillOnboardingDraftGaps({
      name: "Marca",
      brand: "Marca",
      description: "Productos para entrenar.",
      offer: "Accesorios deportivos",
      claims: [],
      limits: [],
    });
    expect(draft.claims).toEqual([]);
    expect(draft.limits).toEqual([]);
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

  it("limpia cookies, navegación y carrito del resumen de una tienda", () => {
    const prestigeLike = "Comprá medias técnicas para running por internet. Tenemos soquetes y medias de compresión. Al navegar por este sitio aceptás el uso de cookies. Iniciar sesión / Crear cuenta. ¡Agregado al carrito!";
    expect(cleanBusinessSummary(prestigeLike)).toBe(
      "Comprá medias técnicas para running por internet. Tenemos soquetes y medias de compresión.",
    );
  });

  it("no trata una llamada a comprar en la tienda como un producto", () => {
    expect(isGenericOfferingName("Comprá online productos en Prestige Running")).toBe(true);
    expect(isGenericOfferingName("Medias técnicas de compresión")).toBe(false);
  });

  it("conserva el estado de importación y de catálogo pendiente", () => {
    const draft = sanitizeDraft({
      stats: { products: 40, services: 2, importedProducts: 40, importedServices: 2, catalogSyncPending: true },
    });
    expect(draft.stats).toMatchObject({
      importedProducts: 40,
      importedServices: 2,
      catalogSyncPending: true,
    });
  });

  it("normaliza público y objetivos sin romper borradores anteriores", () => {
    const legacy = sanitizeDraft({ name: "Prestige" });
    expect(legacy.targetAudience).toBe("");
    expect(legacy.businessGoals).toEqual([]);
    const draft = sanitizeDraft({
      targetAudience: "Corredores y deportistas",
      businessGoals: ["Vender online", "Comunicar beneficios", "Fidelizar", "Ignorar"],
    });
    expect(draft.targetAudience).toBe("Corredores y deportistas");
    expect(draft.businessGoals).toEqual(["Vender online", "Comunicar beneficios", "Fidelizar"]);
  });

  it("conserva la trazabilidad de las inferencias comerciales sugeridas", () => {
    const draft = sanitizeDraft({
      targetAudience: "Corredores y deportistas",
      businessGoals: ["Vender online", "Comunicar beneficios técnicos"],
      evidence: {
        targetAudience: { url: "https://prestige.test", status: "suggested", confidence: "medium" },
        businessGoals: { url: "https://prestige.test", status: "suggested", confidence: "medium" },
      },
    });
    expect(draft.evidence.targetAudience?.status).toBe("suggested");
    expect(draft.evidence.businessGoals?.status).toBe("suggested");
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

  it("conserva público y objetivos editados manualmente al reanalizar", () => {
    const previous = sanitizeDraft({
      targetAudience: "Corredores de trail",
      businessGoals: ["Vender online"],
      manualFields: ["targetAudience", "businessGoals"],
    });
    const fresh = sanitizeDraft({
      targetAudience: "Deportistas en general",
      businessGoals: ["Captar clientes"],
    });
    const merged = mergeManualFields(fresh, previous);
    expect(merged.targetAudience).toBe("Corredores de trail");
    expect(merged.businessGoals).toEqual(["Vender online"]);
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
