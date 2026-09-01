import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  cleanBusinessSummary,
  containsOfferingLeak,
  fillOnboardingDraftGaps,
  generatedKnowledge,
  isGenericOfferingName,
  matchConfirmedBrand,
  mergeManualFields,
  parseDomainKeywords,
  sanitizeDraft,
  semanticAudienceFallback,
  summarizeForPrompt,
} from "@/lib/onboarding";
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
      topics: ["running", "trail"],
    }, "https://prestige.test");
    expect(getOnboardingCompletionIssues(draft)).toEqual([]);
    expect(draft.targetAudience).toContain("running");
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

  it("no inventa público objetivo a partir de nombres de producto cuando no hay categorías ni temas", () => {
    const draft = fillOnboardingDraftGaps({
      name: "Marca",
      brand: "Marca",
      description: "Tienda online de accesorios.",
      offer: "Accesorios variados",
    });
    expect(draft.targetAudience).toBe("");
    expect(getOnboardingCompletionIssues(draft).map((issue) => issue.key)).toContain("targetAudience");
  });

  it("deriva público objetivo desde las categorías detectadas, no desde nombres de producto", () => {
    const audience = semanticAudienceFallback({
      offerings: [
        { id: "1", kind: "product", name: "Trail Pro. Media caña. Art 1025", category: "Trail", description: "", specs: "", scope: "", modality: "", audience: "", price: "Por confirmar", availability: "Por confirmar", url: "", selected: true, evidence: { url: "", status: "extracted", confidence: "high" } },
        { id: "2", kind: "product", name: "Media de compresión graduada 15-20 mm Hg. Art 1010", category: "Compresion Graduada", description: "", specs: "", scope: "", modality: "", audience: "", price: "Por confirmar", availability: "Por confirmar", url: "", selected: true, evidence: { url: "", status: "extracted", confidence: "high" } },
      ],
      topics: [],
    });
    expect(audience).toBe("Personas interesadas en Trail y Compresion Graduada.");
    expect(audience).not.toContain("Art 1025");
    expect(audience).not.toContain("1010");
  });

  it("mapea un título de sitio a la marca ya confirmada en vez de duplicarla", () => {
    expect(matchConfirmedBrand("Tienda Online de Prestige Running", ["Prestige"])).toBe("Prestige");
    expect(matchConfirmedBrand("MidiPlus Argentina", ["MidiPlus", "Kressmer"])).toBe("MidiPlus");
    expect(matchConfirmedBrand("Un sitio sin relación", ["Prestige"])).toBeNull();
  });

  it("rechaza un público objetivo que copia SKUs, artículos o precios", () => {
    const offerings = [
      { id: "1", kind: "product" as const, name: "Trail Pro. Media caña. Art 1025", category: "Trail", description: "", specs: "", scope: "", modality: "", audience: "", price: "Por confirmar", availability: "Por confirmar", url: "", selected: true, evidence: { url: "", status: "extracted" as const, confidence: "high" as const } },
    ];
    expect(containsOfferingLeak("Personas interesadas en Trail Pro. Media caña. Art 1025", offerings)).toBe(true);
    expect(containsOfferingLeak("Compra Art 1025 desde $5000", offerings)).toBe(true);
    expect(containsOfferingLeak("Personas que practican running y trail", offerings)).toBe(false);
  });

  it("resume categorías y usos repetidos para el prompt, sin depender de una sola página", () => {
    const page = (overrides: Partial<Parameters<typeof summarizeForPrompt>[0][number]>) => ({
      url: "https://tienda.test/x", title: "Tienda", description: "", text: "", pageType: "product",
      offerings: [], socialNetworks: [], platform: "Tiendanube", hash: "x",
      ...overrides,
    });
    const signals = summarizeForPrompt([
      page({ title: "Tienda | Inicio" }),
      page({
        offerings: [
          { id: "1", kind: "product", name: "Trail Pro", category: "Trail", description: "", specs: "", scope: "Running y trail", modality: "", audience: "Corredores", price: "Por confirmar", availability: "Por confirmar", url: "", selected: true, evidence: { url: "", status: "extracted", confidence: "high" } },
          { id: "2", kind: "product", name: "Compresion 15-20", category: "Compresion Graduada", description: "", specs: "", scope: "Running y trail", modality: "", audience: "Corredores", price: "Por confirmar", availability: "Por confirmar", url: "", selected: true, evidence: { url: "", status: "extracted", confidence: "high" } },
        ],
      }),
    ]);
    expect(signals.categories.map((item) => item.name)).toEqual(["Trail", "Compresion Graduada"]);
    expect(signals.repeatedUses).toContain("Running y trail");
    expect(signals.representativeProducts).toEqual(["Trail Pro", "Compresion 15-20"]);
  });

  it("parsea domainKeywords de forma segura, incluso con JSON inválido", () => {
    expect(parseDomainKeywords('["running","trail"]')).toEqual(["running", "trail"]);
    expect(parseDomainKeywords("")).toEqual([]);
    expect(parseDomainKeywords("{roto")).toEqual([]);
    expect(parseDomainKeywords(null)).toEqual([]);
  });
});
