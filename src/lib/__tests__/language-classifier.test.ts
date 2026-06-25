import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { classifyOpportunity } from "../ai-opportunity-classifier";

const mockClient = {
  id: "client1",
  name: "PC MIDI Center",
  slug: "pcmidi",
  openrouterApiKey: "mock-key",
  openrouterModel: "mock-model",
};

const mockPrisma = {
  client: {
    findUniqueOrThrow: async () => mockClient,
  },
  brand: {
    findMany: async () => [],
  },
  product: {
    findMany: async () => [],
  },
  knowledgeBase: {
    findMany: async () => [],
  },
} as any;

describe("classifyOpportunity language handling", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retorna correctamente los campos de idioma detectados (inglés)", async () => {
    const mockResponseJson = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "en",
              isSupportedLanguage: true,
              isSpanish: false,
              isSpamOrFluff: false,
              isRelevant: true,
              actionableReason: "Comentario en inglés de soporte técnico",
              detectedIntent: "TECHNICAL_QUESTION",
              priority: "MEDIUM",
              matchedBrandId: null,
              matchedProductId: null,
              confidence: "high",
            }),
          },
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseJson,
    });

    const result = await classifyOpportunity(mockPrisma, {
      sourceText: "How do I configure the MIDI drivers on macOS?",
      channel: "youtube",
      clientId: "client1",
    });

    expect(result.language).toBe("en");
    expect(result.isSupportedLanguage).toBe(true);
    expect(result.isSpanish).toBe(false);
    expect(result.isRelevant).toBe(true);
    expect(result.detectedIntent).toBe("TECHNICAL_QUESTION");
  });

  it("retorna correctamente los campos de idioma detectados (portugués)", async () => {
    const mockResponseJson = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              language: "pt",
              isSupportedLanguage: true,
              isSpanish: false,
              isSpamOrFluff: false,
              isRelevant: true,
              actionableReason: "Comentario en portugués sobre disponibilidad",
              detectedIntent: "PURCHASE_QUESTION",
              priority: "HIGH",
              matchedBrandId: null,
              matchedProductId: null,
              confidence: "high",
            }),
          },
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponseJson,
    });

    const result = await classifyOpportunity(mockPrisma, {
      sourceText: "Onde posso comprar o controlador MidiPlus em São Paulo?",
      channel: "youtube",
      clientId: "client1",
    });

    expect(result.language).toBe("pt");
    expect(result.isSupportedLanguage).toBe(true);
    expect(result.isSpanish).toBe(false);
    expect(result.isRelevant).toBe(true);
    expect(result.detectedIntent).toBe("PURCHASE_QUESTION");
  });
});
