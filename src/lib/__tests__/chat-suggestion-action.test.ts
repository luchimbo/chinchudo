import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredResponse = { id: string; opportunityId: string; editedText: string; isPrimary: boolean; chatHistory: unknown };

const state = vi.hoisted(() => ({
  responses: [] as StoredResponse[],
  contextAssessment: { copilot: { goal: "RESPONDER" } } as Record<string, unknown> | null,
  clientId: "client-1",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({
  requireOwnedClientId: vi.fn(async (clientId: string) => {
    if (clientId !== "client-1") throw new Error("Sin acceso a este cliente.");
    return { id: clientId };
  }),
}));
vi.mock("@/lib/auth", () => ({ assertClientAccess: vi.fn(async () => {}) }));
vi.mock("@/lib/publish-agent", () => ({ checkPublishRateLimits: vi.fn(), closeSiblingOpportunities: vi.fn(), runPublisher: vi.fn() }));
vi.mock("@/lib/youtube-publisher", () => ({ publishYouTubeComment: vi.fn() }));
vi.mock("@/lib/client-context", () => ({
  resolveOpportunityClient: vi.fn(async () => ({ client: { id: "client-1", slug: "cliente", name: "Cliente" }, confidence: "high", reason: "" })),
  loadClientContext: vi.fn(),
}));
vi.mock("@/lib/client-memory", () => ({
  getClientMemories: vi.fn(async () => []),
  getAcceptedExamples: vi.fn(async () => []),
  addClientMemory: vi.fn(),
  deleteClientMemory: vi.fn(),
  extractLearningsFromChat: vi.fn(async () => []),
  replaceChatLearnings: vi.fn(async () => []),
}));
vi.mock("@/lib/refine-draft", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/refine-draft")>()),
  chatRefinementStep: vi.fn(async () => ({ message: "Te la dejo más corta:", suggestion: "Propuesta corta" })),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    response: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
        const response = state.responses.find((item) => item.id === where.id);
        if (!response) throw new Error("not found");
        return {
          ...response,
          draftText: "Borrador guardado",
          brandId: "brand-1",
          brand: { name: "Marca" },
          persona: { name: "Técnico" },
          opportunity: { id: response.opportunityId, clientId: state.clientId, contextAssessment: state.contextAssessment, sourceText: "Comentario", channel: { name: "YouTube" } },
        };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { opportunityId: string; id: { not: string } }; data: Partial<StoredResponse> }) => {
        state.responses.filter((item) => item.opportunityId === where.opportunityId && item.id !== where.id.not).forEach((item) => Object.assign(item, data));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<StoredResponse> }) => {
        Object.assign(state.responses.find((item) => item.id === where.id)!, data);
      }),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

import { applyChatSuggestionAction, sendRefinementMessageAction } from "@/app/(app)/opportunities/actions";
import { chatRefinementStep } from "@/lib/refine-draft";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const history = [
  { sender: "user", text: "Más corta" },
  { sender: "assistant", text: "Ahí va:", suggestion: { original: "Propuesta de la IA", text: "Propuesta editada" } },
];

describe("propuestas editables del chat del Asistente CM", () => {
  beforeEach(() => {
    state.responses = [
      { id: "response-1", opportunityId: "opportunity-1", editedText: "", isPrimary: false, chatHistory: [] },
      { id: "response-2", opportunityId: "opportunity-1", editedText: "", isPrimary: true, chatHistory: [] },
    ];
    state.contextAssessment = { copilot: { goal: "RESPONDER" } };
    state.clientId = "client-1";
    vi.clearAllMocks();
  });

  it("le pasa a la IA el texto en pantalla y el tope, y devuelve la propuesta aparte", async () => {
    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Más corta", chatHistory: "[]", currentText: "Lo que ve el CM" }));

    expect(result).toEqual({ success: true, reply: "Te la dejo más corta:", suggestion: "Propuesta corta" });
    expect(vi.mocked(chatRefinementStep).mock.calls[0][0]).toMatchObject({ currentResponseText: "Lo que ve el CM", maxCharacters: 280 });
  });

  it("\"Usar esta respuesta\" guarda el texto como respuesta principal y conserva la edición en el chat", async () => {
    await applyChatSuggestionAction(form({ responseId: "response-1", text: "Propuesta editada", chatHistory: JSON.stringify(history) }));

    expect(state.responses[0]).toMatchObject({ editedText: "Propuesta editada", isPrimary: true });
    expect(state.responses[0].chatHistory).toEqual(history);
    expect(state.responses[1].isPrimary).toBe(false);
  });

  it("no deja usar una propuesta de más de 280 caracteres en el Asistente CM", async () => {
    await expect(applyChatSuggestionAction(form({ responseId: "response-1", text: "a".repeat(281), chatHistory: "[]" }))).rejects.toThrow("280");
    expect(state.responses[0].editedText).toBe("");
  });

  it("rechaza respuestas de otro cliente", async () => {
    state.clientId = "client-2";
    await expect(applyChatSuggestionAction(form({ responseId: "response-1", text: "Propuesta", chatHistory: "[]" }))).rejects.toThrow("Sin acceso");
    expect(state.responses[0].editedText).toBe("");
  });
});
