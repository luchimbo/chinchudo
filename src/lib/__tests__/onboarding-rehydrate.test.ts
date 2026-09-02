import { describe, expect, it } from "vitest";
import { sanitizeDraft, type OnboardingOffering } from "@/lib/onboarding";
import {
  readConfirmedSnapshot,
  rehydrateDraftFromConfirmed,
  resolveConfirmedBrand,
  type ConfirmedBrand,
  type ConfirmedSnapshot,
} from "@/lib/onboarding-rehydrate";

function makeOffering(overrides: Partial<OnboardingOffering> = {}): OnboardingOffering {
  return {
    id: "off-1",
    kind: "product",
    name: "Producto",
    category: "",
    description: "",
    specs: "",
    scope: "",
    modality: "",
    audience: "",
    price: "Por confirmar",
    availability: "Por confirmar",
    url: "",
    selected: true,
    evidence: { url: "", status: "extracted", confidence: "high" },
    ...overrides,
  };
}

function makeBrand(overrides: Partial<ConfirmedBrand> = {}): ConfirmedBrand {
  return {
    id: "brand-1",
    name: "Marca",
    tone: "Cercano",
    strengths: "Calidad",
    allowedClaims: "Podemos decir X\nPodemos decir Y",
    forbiddenClaims: "No decir Z",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ConfirmedSnapshot> = {}): ConfirmedSnapshot {
  return {
    clientId: "client-1",
    name: "Cliente confirmado",
    description: "Descripción confirmada",
    topics: ["running", "medias"],
    policy: { targetAudience: "Corredores", businessGoals: ["Vender más"] },
    brand: makeBrand(),
    brandCount: 1,
    brandAmbiguous: false,
    offerings: [makeOffering({ id: "prod-ext-1", name: "Media técnica" })],
    knowledge: [
      { topic: "Problema que resolvemos", content: "Ampollas al correr" },
      { topic: "Cómo elegir una opción", content: "Según distancia" },
    ],
    networks: ["Instagram", "TikTok"],
    ...overrides,
  };
}

describe("resolveConfirmedBrand", () => {
  const brands = [makeBrand({ id: "b1", name: "Marca Vieja" }), makeBrand({ id: "b2", name: "Otra Marca" })];

  it("prioriza confirmedBrandId cuando sigue vivo", () => {
    const draft = { brand: "Cualquiera", offerings: [], confirmedBrandId: "b2" };
    expect(resolveConfirmedBrand(draft, brands, [], [])?.id).toBe("b2");
  });

  it("ignora confirmedBrandId si ya no existe y sigue la cascada", () => {
    const draft = { brand: "Marca Vieja", offerings: [], confirmedBrandId: "b-eliminada" };
    expect(resolveConfirmedBrand(draft, brands, [], [])?.id).toBe("b1");
  });

  it("hace match exacto por nombre", () => {
    const draft = { brand: "Otra Marca", offerings: [], confirmedBrandId: "" };
    expect(resolveConfirmedBrand(draft, brands, [], [])?.id).toBe("b2");
  });

  it("resuelve por procedencia cuando la marca fue renombrada", () => {
    const draft = {
      brand: "Nombre que ya no coincide con nada",
      offerings: [makeOffering({ id: "ext-42" })],
      confirmedBrandId: "",
    };
    const products = [{ brandId: "b2", sourceExternalId: "ext-42" }];
    expect(resolveConfirmedBrand(draft, brands, products, [])?.id).toBe("b2");
  });

  it("hace match difuso vía matchConfirmedBrand", () => {
    const draft = { brand: "tienda de Otra Marca", offerings: [], confirmedBrandId: "" };
    expect(resolveConfirmedBrand(draft, brands, [], [])?.id).toBe("b2");
  });

  it("devuelve la única marca si no hay ningún otro criterio", () => {
    const draft = { brand: "Nombre irreconocible", offerings: [], confirmedBrandId: "" };
    expect(resolveConfirmedBrand(draft, [brands[0]], [], [])?.id).toBe("b1");
  });

  it("devuelve null (ambiguo) cuando hay varias marcas y ninguna coincide", () => {
    const draft = { brand: "Nombre irreconocible", offerings: [], confirmedBrandId: "" };
    expect(resolveConfirmedBrand(draft, brands, [], [])).toBeNull();
  });

  it("devuelve null cuando no hay ninguna marca confirmada", () => {
    const draft = { brand: "Marca", offerings: [], confirmedBrandId: "" };
    expect(resolveConfirmedBrand(draft, [], [], [])).toBeNull();
  });
});

describe("rehydrateDraftFromConfirmed", () => {
  it("el dominio gana en name/description/topics aunque el draft tenga otro valor", () => {
    const draft = sanitizeDraft({ name: "Nombre viejo del draft", description: "Desc vieja", topics: ["viejo"] });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.name).toBe("Cliente confirmado");
    expect(result.description).toBe("Descripción confirmada");
    expect(result.topics).toEqual(["running", "medias"]);
  });

  it("el dominio gana aunque esté vacío: una descripción borrada queda borrada", () => {
    const draft = sanitizeDraft({ name: "Cliente", description: "Algo que el usuario había escrito" });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot({ description: "" }));
    expect(result.description).toBe("");
  });

  it("toma tono/oferta/claims/limits de la marca resuelta", () => {
    const draft = sanitizeDraft({ name: "Cliente", brand: "Nombre viejo", tone: "viejo", offer: "vieja" });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.brand).toBe("Marca");
    expect(result.tone).toBe("Cercano");
    expect(result.offer).toBe("Calidad");
    expect(result.claims).toEqual(["Podemos decir X", "Podemos decir Y"]);
    expect(result.limits).toEqual(["No decir Z"]);
  });

  it("sin marca resuelta, cae a responsePolicy cuando existe la clave", () => {
    const draft = sanitizeDraft({ name: "Cliente", tone: "viejo", claims: ["viejo"] });
    const result = rehydrateDraftFromConfirmed(
      draft,
      makeSnapshot({ brand: null, brandAmbiguous: true, policy: { tone: "Confirmado", claims: ["Claim confirmado"] } }),
    );
    expect(result.tone).toBe("Confirmado");
    expect(result.claims).toEqual(["Claim confirmado"]);
  });

  it("clave ausente en responsePolicy cae al draft (cliente previo al onboarding)", () => {
    const draft = sanitizeDraft({ name: "Cliente", targetAudience: "Del draft" });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot({ policy: {} }));
    expect(result.targetAudience).toBe("Del draft");
  });

  it("clave presente pero vacía en responsePolicy gana sobre el draft", () => {
    const draft = sanitizeDraft({ name: "Cliente", targetAudience: "Del draft" });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot({ policy: { targetAudience: "" } }));
    expect(result.targetAudience).toBe("");
  });

  it("mapea las filas de KnowledgeBase por orden y completa huecos con el draft", () => {
    // sanitizeDraft comprime los slots vacíos hacia el final; para fijar
    // exactamente qué slot queda vacío se construye el draft ya sanitizado.
    const draft = {
      ...sanitizeDraft({ name: "Cliente" }),
      knowledge: ["", "", "Pregunta frecuente del draft"],
      knowledgePrompts: ["P1", "P2", "P3 del draft"],
    };
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.knowledge[0]).toBe("Ampollas al correr");
    expect(result.knowledge[1]).toBe("Según distancia");
    expect(result.knowledge[2]).toBe("Pregunta frecuente del draft");
    expect(result.knowledgePrompts[0]).toBe("Problema que resolvemos");
  });

  it("reemplaza el catálogo del draft por el confirmado", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      offerings: [makeOffering({ id: "borrada-en-products", name: "Ya no existe" })],
    });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.offerings.map((item) => item.id)).toEqual(["prod-ext-1"]);
  });

  it("conserva del draft las ofertas manuales sin fila de dominio todavía", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      offerings: [
        makeOffering({
          id: "manual-1",
          name: "Oferta manual",
          url: "https://tunegocio.com.ar",
          evidence: { url: "https://tunegocio.com.ar", status: "manual", confidence: "high" },
        }),
      ],
    });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.offerings.map((item) => item.id)).toContain("manual-1");
  });

  it("conserva del draft las ofertas pendientes de sincronizar (catalogSyncPending)", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      offerings: [makeOffering({ id: "pendiente-1" })],
      stats: { pagesRead: 1, pagesDiscarded: 0, products: 1, services: 0, durationMs: 1, catalogSyncPending: true },
    });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.offerings.map((item) => item.id)).toContain("pendiente-1");
  });

  it("descarta del draft una oferta sin fila de dominio y sin marca manual/pendiente (borrada en /products)", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      brand: "Marca",
      offerings: [makeOffering({ id: "borrada-a-mano" })],
    });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.offerings.map((item) => item.id)).not.toContain("borrada-a-mano");
  });

  it("toma selectedNetworks de los MonitoredSource activos", () => {
    const draft = sanitizeDraft({ name: "Cliente", selectedNetworks: ["Facebook"] });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.selectedNetworks).toEqual(["Instagram", "TikTok"]);
  });

  it("preserva stats/warnings/evidence del draft verbatim (DRAFT_ONLY_KEYS)", () => {
    const draft = sanitizeDraft({
      name: "Cliente",
      warnings: ["Advertencia del draft"],
      stats: { pagesRead: 7, pagesDiscarded: 1, products: 2, services: 1, durationMs: 500 },
    });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.warnings).toEqual(["Advertencia del draft"]);
    expect(result.stats.pagesRead).toBe(7);
  });

  it("agrega a manualFields toda clave tomada del dominio, protegiendo un re-análisis posterior", () => {
    const draft = sanitizeDraft({ name: "Cliente" });
    const result = rehydrateDraftFromConfirmed(draft, makeSnapshot());
    expect(result.manualFields).toEqual(
      expect.arrayContaining(["name", "description", "topics", "brand", "tone", "offer", "claims", "limits"]),
    );
  });
});

describe("readConfirmedSnapshot", () => {
  function makeFakePrisma(rows: {
    brands?: any[];
    products?: any[];
    services?: any[];
    knowledge?: any[];
    monitoredSources?: any[];
  }) {
    return {
      brand: { findMany: async () => rows.brands || [] },
      product: { findMany: async () => rows.products || [] },
      service: { findMany: async () => rows.services || [] },
      knowledgeBase: { findMany: async () => rows.knowledge || [] },
      monitoredSource: { findMany: async () => rows.monitoredSources || [] },
    } as any;
  }

  it("arma un snapshot vacío cuando el cliente no tiene nada confirmado todavía", async () => {
    const prisma = makeFakePrisma({});
    const client = { id: "c1", name: "Cliente", description: "", domainKeywords: "[]", responsePolicy: {} };
    const draft = sanitizeDraft({ name: "Cliente" });
    const snapshot = await readConfirmedSnapshot(prisma, client, draft);
    expect(snapshot.brand).toBeNull();
    expect(snapshot.brandAmbiguous).toBe(false);
    expect(snapshot.offerings).toEqual([]);
  });

  it("marca brandAmbiguous cuando hay más de una marca y ninguna coincide", async () => {
    const prisma = makeFakePrisma({
      brands: [makeBrand({ id: "b1", name: "Una" }), makeBrand({ id: "b2", name: "Otra" })],
    });
    const client = { id: "c1", name: "Cliente", description: "", domainKeywords: "[]", responsePolicy: {} };
    const draft = sanitizeDraft({ name: "Cliente", brand: "Nombre irreconocible" });
    const snapshot = await readConfirmedSnapshot(prisma, client, draft);
    expect(snapshot.brand).toBeNull();
    expect(snapshot.brandAmbiguous).toBe(true);
    expect(snapshot.brandCount).toBe(2);
  });

  it("reconstruye offerings sólo de la marca resuelta, no de otras marcas del cliente", async () => {
    const prisma = makeFakePrisma({
      brands: [makeBrand({ id: "b1", name: "Marca" })],
      products: [
        { brandId: "b1", name: "De esta marca", category: "", description: "", technicalSpecs: "", useCases: "", stockStatus: "", priceRange: "", sourceExternalId: "p1", sourceUrl: "" },
        { brandId: "otra-marca", name: "De otra marca", category: "", description: "", technicalSpecs: "", useCases: "", stockStatus: "", priceRange: "", sourceExternalId: "p2", sourceUrl: "" },
      ],
    });
    const client = { id: "c1", name: "Cliente", description: "", domainKeywords: "[]", responsePolicy: {} };
    const draft = sanitizeDraft({ name: "Cliente", brand: "Marca" });
    const snapshot = await readConfirmedSnapshot(prisma, client, draft);
    expect(snapshot.offerings.map((item) => item.name)).toEqual(["De esta marca"]);
  });
});
