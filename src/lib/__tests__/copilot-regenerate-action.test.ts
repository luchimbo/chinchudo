import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredResponse = {
  id: string;
  opportunityId: string;
  personaId: string;
  brandId: string;
  draftText: string;
  approvedBy: string;
  acceptedAsCorrectAt: Date | null;
  isPrimary: boolean;
  createdAt: Date;
};

const state = vi.hoisted(() => ({
  context: {} as Record<string, unknown>,
  responses: [] as StoredResponse[],
  nextId: 1,
}));

function matches(response: StoredResponse, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, condition]) => {
    const value = response[key as keyof StoredResponse];
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      const { not, notIn } = condition as { not?: unknown; notIn?: unknown[] };
      if (notIn) return !notIn.includes(value);
      return value !== not;
    }
    return value === condition;
  });
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ requireOwnedClientId: vi.fn(async () => ({ id: "client-1" })) }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: vi.fn(async () => {}) }));
vi.mock("@/lib/publish-agent", () => ({ checkPublishRateLimits: vi.fn(), closeSiblingOpportunities: vi.fn(), runPublisher: vi.fn() }));
vi.mock("@/lib/youtube-publisher", () => ({ publishYouTubeComment: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, resetInMs: 0 })) }));
vi.mock("@/lib/client-context", () => ({
  resolveOpportunityClient: vi.fn(async () => ({ client: { id: "client-1", slug: "cliente" }, confidence: "high", reason: "" })),
  loadClientContext: vi.fn(async () => ({ catalogProducts: [], catalogRules: [], services: [] })),
}));
vi.mock("@/lib/guardrails", () => ({
  validateClientScopedActors: vi.fn(() => ({ ok: true, riskNotes: [] })),
  detectCrossClientTerms: vi.fn(async () => []),
}));
vi.mock("@/lib/knowledge", () => ({ loadRelevantKnowledge: vi.fn(async () => ({ knowledge: [], objections: [] })) }));
vi.mock("@/lib/prompts", () => ({ loadActivePrompt: vi.fn(async () => null) }));
vi.mock("@/lib/client-memory", () => ({ getClientMemories: vi.fn(async () => []), getAcceptedExamples: vi.fn(async () => []) }));
vi.mock("@/lib/observed-profiles", () => ({ loadObservedProfileContext: vi.fn(async () => null) }));
vi.mock("@/lib/competitor-evidence", () => ({ loadRelevantCompetitorEvidence: vi.fn(async () => []) }));
vi.mock("@/lib/persona-router", () => ({ selectVoiceVariant: vi.fn(() => ({ voiceVariant: "", voiceVariantReason: "" })) }));
vi.mock("@/lib/draft-output", () => ({ ensureRequiredBrandMention: vi.fn((text: string) => text) }));
vi.mock("@/lib/draft-generator", () => ({
  generateLocalDrafts: vi.fn(() => [{ variantType: "SHORT", draftText: "Propuesta local", riskNotes: "" }]),
}));
vi.mock("@/lib/ai-draft-generator", () => ({
  COPILOT_MAX_CHARACTERS: 280,
  generateAICopilotDraft: vi.fn(async () => ({ variantType: "SHORT", draftText: "Respuesta con lo aprendido", riskNotes: "" })),
  generateAIDrafts: vi.fn(),
  shortenCopilotText: vi.fn((text: string) => text),
}));
vi.mock("@/lib/db", () => {
  const brand = { id: "brand-1", clientId: "client-1", name: "Marca" };
  const persona = { id: "persona-1", clientId: "client-1", name: "Técnico" };
  const prisma = {
    opportunity: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "opportunity-1", clientId: "client-1", status: "DRAFTED", sourceText: "¿Cómo conecto el teclado al celular?",
        detectedIntent: "HOW_TO", detectedBrandId: "brand-1", detectedBrand: brand, detectedProductId: null, detectedProduct: null,
        contextAssessment: state.context, channel: { name: "YouTube" }, monitoredSource: null,
        responses: state.responses.filter((response) => response.opportunityId === "opportunity-1").map(({ id }) => ({ id })),
      })),
      update: vi.fn(async ({ data }: { data: { contextAssessment?: Record<string, unknown> } }) => {
        if (data.contextAssessment) state.context = data.contextAssessment;
      }),
    },
    brand: { findUnique: vi.fn(async () => brand), findUniqueOrThrow: vi.fn(async () => brand) },
    persona: { findMany: vi.fn(async () => [persona]), findUniqueOrThrow: vi.fn(async () => persona) },
    trend: { findMany: vi.fn(async () => []) },
    response: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = state.responses.find((response) => response.id === where.id);
        if (!found) throw new Error("not found");
        return found;
      }),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.responses.filter((response) => matches(response, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const before = state.responses.length;
        state.responses = state.responses.filter((response) => !matches(response, where));
        return { count: before - state.responses.length };
      }),
      createMany: vi.fn(async ({ data }: { data: Partial<StoredResponse>[] }) => {
        for (const item of data) {
          state.responses.push({
            id: `response-new-${state.nextId}`, opportunityId: "", personaId: "", brandId: "", draftText: "", approvedBy: "",
            acceptedAsCorrectAt: null, isPrimary: false, ...item, createdAt: new Date(Date.now() + state.nextId++),
          });
        }
        return { count: data.length };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<StoredResponse> }) => {
        state.responses.filter((response) => matches(response, where)).forEach((response) => Object.assign(response, data));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredResponse> }) => {
        Object.assign(state.responses.find((response) => response.id === where.id)!, data);
      }),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { prisma };
});

import { regenerateCopilotResponse } from "@/app/(app)/opportunities/actions";
import { generateAICopilotDraft } from "@/lib/ai-draft-generator";

function storedResponse(overrides: Partial<StoredResponse>): StoredResponse {
  return {
    id: "response-old", opportunityId: "opportunity-1", personaId: "persona-1", brandId: "brand-1", draftText: "Respuesta vieja",
    approvedBy: "", acceptedAsCorrectAt: null, isPrimary: true, createdAt: new Date(0), ...overrides,
  };
}

function regenerateForm(responseId = "response-old") {
  const form = new FormData();
  form.set("opportunityId", "opportunity-1");
  form.set("responseId", responseId);
  return form;
}

describe("Regenerar respuesta en Copiloto", () => {
  beforeEach(() => {
    state.context = {};
    state.responses = [];
    state.nextId = 1;
    vi.clearAllMocks();
  });

  it("reemplaza la respuesta sin aceptar, aunque sea de otra voz, por una nueva principal", async () => {
    state.responses = [storedResponse({ personaId: "persona-anterior" })];

    await regenerateCopilotResponse(regenerateForm());

    expect(state.responses).toHaveLength(1);
    expect(state.responses[0]).toMatchObject({ id: "response-new-1", draftText: "Respuesta con lo aprendido", isPrimary: true });
    expect(generateAICopilotDraft).toHaveBeenCalledTimes(1);
  });

  it("conserva la respuesta aceptada como ejemplo y deja la nueva como principal", async () => {
    state.responses = [storedResponse({ approvedBy: "CM", acceptedAsCorrectAt: new Date(1) })];

    await regenerateCopilotResponse(regenerateForm());

    expect(state.responses.find((response) => response.id === "response-old")).toMatchObject({ isPrimary: false, draftText: "Respuesta vieja" });
    expect(state.responses.find((response) => response.id === "response-new-1")).toMatchObject({ isPrimary: true });
  });

  it("rechaza una respuesta de otra oportunidad sin generar nada", async () => {
    state.responses = [storedResponse({ id: "response-ajena", opportunityId: "opportunity-2" })];

    await expect(regenerateCopilotResponse(regenerateForm("response-ajena"))).rejects.toThrow("no corresponde");
    expect(generateAICopilotDraft).not.toHaveBeenCalled();
    expect(state.responses).toHaveLength(1);
  });
});
