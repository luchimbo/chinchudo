import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { suggestedFields, type ConfirmedClientContext, type WebsitePage, type OnboardingOffering } from "@/lib/onboarding";

// logger.warn escribe en SystemLog vía el prisma real (@/lib/db). Sin mockear
// esto, correr estos tests escribe filas reales en la base configurada por DATABASE_URL.
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Fuerza el proveedor OpenRouter para que cada intento sea exactamente un
  // fetch, sin el fallback local→OpenRouter de fetchChatCompletion duplicando llamadas.
  process.env.LLM_PROVIDER = "openrouter";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

function makePage(overrides: Partial<WebsitePage> = {}): WebsitePage {
  return {
    url: "https://tienda.test/",
    title: "Prestige Running | Tienda",
    description: "Medias técnicas para running y trail.",
    text: "Medias técnicas para running y trail. Envío a todo el país.",
    pageType: "other",
    offerings: [],
    socialNetworks: [],
    platform: "Tiendanube",
    hash: "home",
    ...overrides,
  };
}

const offering = (overrides: Partial<OnboardingOffering> = {}): OnboardingOffering => ({
  id: "1",
  kind: "product",
  name: "Trail Pro. Media caña. Art 1025",
  category: "Trail",
  description: "",
  specs: "",
  scope: "Running y trail",
  modality: "",
  audience: "Corredores",
  price: "Por confirmar",
  availability: "Por confirmar",
  url: "https://tienda.test/p/1",
  selected: true,
  evidence: { url: "https://tienda.test/p/1", status: "extracted", confidence: "high" },
  ...overrides,
});

const context: ConfirmedClientContext = {
  name: "PRESTIGE MEDIAS",
  brands: ["Prestige"],
  description: "",
  domainKeywords: [],
  openrouterApiKey: "test-key",
  openrouterModel: "test-model",
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }] }), { status: 200 });
}

describe("suggestedFields", () => {
  it("devuelve vacío sin llamar a la red cuando no hay API key configurada", async () => {
    process.env.LLM_PROVIDER = "openrouter";
    delete process.env.OPENROUTER_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [], { ...context, openrouterApiKey: "" });
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("acepta una respuesta correcta de la IA sin reintentar", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        name: "PRESTIGE MEDIAS",
        description: "Medias técnicas para running y trail.",
        brand: "Prestige",
        offer: "Medias técnicas de compresión",
        targetAudience: "Personas que practican running y trail",
        businessGoals: ["Vender online"],
        tone: "Cercana y técnica",
        topics: ["running", "trail"],
        claims: [],
        limits: [],
        knowledge: ["a", "b", "c"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [offering()], context);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.targetAudience).toBe("Personas que practican running y trail");
    expect(result.brand).toBe("Prestige");
  });

  it("rechaza un targetAudience que copia SKUs y reintenta una vez con instrucciones correctivas", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          targetAudience: "Personas que buscan Trail Pro. Media caña. Art 1025",
          offer: "",
          description: "",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          targetAudience: "Personas que practican running y trail",
          offer: "Medias técnicas para running",
          description: "Medias técnicas para deportistas.",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [offering()], context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.messages[0].content).toContain("intento anterior");
    expect(result.targetAudience).toBe("Personas que practican running y trail");
  });

  it("reintenta cuando la respuesta llega vacía y usa el resultado del segundo intento", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ offer: "Medias técnicas", description: "Medias técnicas para correr." }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [offering()], context);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.offer).toBe("Medias técnicas");
  });

  it("cuando ambos intentos fallan (HTTP, JSON inválido, sin conexión) devuelve vacío sin lanzar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockRejectedValueOnce(new TypeError("network unreachable"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [offering()], context);
    expect(result).toEqual({});
  });

  it("descarta JSON inválido del proveedor sin lanzar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "no es json" } }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(jsonResponse({ offer: "Medias técnicas" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await suggestedFields([makePage()], [offering()], context);
    expect(result.offer).toBe("Medias técnicas");
  });
});
