import { beforeEach, describe, expect, it, vi } from "vitest";

type StoredResponse = { id: string; opportunityId: string; editedText: string; isPrimary: boolean; chatHistory: unknown; approvedBy?: string; acceptedAsCorrectAt?: Date };

const state = vi.hoisted(() => ({
  responses: [] as StoredResponse[],
  contextAssessment: { copilot: { goal: "RESPONDER" } } as Record<string, unknown> | null,
  clientId: "client-1",
  clientSlug: "cliente",
  brandName: "Marca",
  productName: "",
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
  resolveOpportunityClient: vi.fn(async () => ({ client: { id: "client-1", slug: state.clientSlug, name: "Cliente" }, confidence: "high", reason: "" })),
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
          brand: { name: state.brandName },
          persona: { name: "Técnico" },
          opportunity: { id: response.opportunityId, clientId: state.clientId, contextAssessment: state.contextAssessment, sourceText: "Comentario", detectedProductId: state.productName ? "product-1" : null, detectedProduct: state.productName ? { name: state.productName } : null, channel: { name: "YouTube" } },
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
import { extractLearningsFromChat, replaceChatLearnings } from "@/lib/client-memory";
import { COPILOT_MAX_CHARACTERS, COPILOT_TARGET_CHARACTERS } from "@/lib/copilot-limits";

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
    state.clientSlug = "cliente";
    state.brandName = "Marca";
    state.productName = "";
    vi.clearAllMocks();
  });

  it("le pasa a la IA el texto en pantalla y el tope, y devuelve la propuesta aparte", async () => {
    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Más corta", chatHistory: JSON.stringify([{ sender: "user", text: "Más corta" }]), currentText: "Lo que ve el CM" }));

    expect(result).toEqual({ success: true, reply: "Te la dejo más corta:", suggestion: "Propuesta corta" });
    expect(vi.mocked(chatRefinementStep).mock.calls[0][0]).toMatchObject({ currentResponseText: "Lo que ve el CM", chatHistory: [], maxCharacters: COPILOT_MAX_CHARACTERS, targetCharacters: COPILOT_TARGET_CHARACTERS });
    expect(state.responses[0].chatHistory).toEqual(expect.arrayContaining([
      { sender: "user", text: "Más corta" },
      expect.objectContaining({ sender: "assistant", text: "Te la dejo más corta:", suggestion: { original: "Propuesta corta", text: "Propuesta corta" } }),
    ]));
  });

  it("\"Usar esta respuesta\" guarda el texto correcto y aprende la edición del chat", async () => {
    vi.mocked(extractLearningsFromChat).mockResolvedValueOnce([{ rule: "Evitar aperturas con Mirá", summary: "Sin Mirá", category: "tone" }]);
    vi.mocked(replaceChatLearnings).mockResolvedValueOnce(["Evitar aperturas con Mirá"]);
    const result = await applyChatSuggestionAction(form({ responseId: "response-1", text: "Propuesta editada", chatHistory: JSON.stringify(history) }));

    expect(result).toEqual({ success: true, learnedRules: ["Evitar aperturas con Mirá"] });
    expect(state.responses[0]).toMatchObject({ editedText: "Propuesta editada", isPrimary: true, approvedBy: "CM", acceptedAsCorrectAt: expect.any(Date) });
    expect(state.responses[0].chatHistory).toEqual(history);
    expect(state.responses[1].isPrimary).toBe(false);
    expect(extractLearningsFromChat).toHaveBeenCalledWith(expect.objectContaining({
      finalResponseText: "Propuesta editada",
      chatHistory: expect.arrayContaining([{ sender: "user", text: 'Edité tu propuesta directamente, quedó así: "Propuesta editada"' }]),
    }));
    expect(replaceChatLearnings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ responseId: "response-1", clientId: "client-1" }));
  });

  it("quita las frases corregidas por el CM de la siguiente propuesta de pcmidi", async () => {
    state.clientSlug = "pcmidi";
    vi.mocked(chatRefinementStep).mockResolvedValueOnce({
      message: "Nueva versión:",
      suggestion: "Mirá, el MiniLab 3 suma faders y mejor integración con tu DAW. Consultá en PC MIDI Center por stock y precio.",
    });
    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "No abras con Mirá ni cierres con la tienda", chatHistory: "[]", currentText: "Borrador" }));

    expect(result.suggestion).toBe("El MiniLab 3 suma faders y mejor integración con tu DAW.");
    expect(state.responses[0].chatHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ sender: "user", text: "No abras con Mirá ni cierres con la tienda" }),
      expect.objectContaining({ sender: "assistant", suggestion: { text: result.suggestion, original: result.suggestion } }),
    ]));
  });

  it("normaliza marca y modelo en una propuesta nueva del chat", async () => {
    state.brandName = "Arturia";
    state.productName = "Arturia MiniLab 3 Black Edition Controlador MIDI 25 Teclas";
    vi.mocked(chatRefinementStep).mockResolvedValueOnce({
      message: "Nueva versión:",
      suggestion: "El Arturia MiniLab 3 Black Edition Controlador MIDI 25 Teclas suma controles útiles.",
    });
    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Hacela más clara", chatHistory: "[]", currentText: "Borrador" }));

    expect(vi.mocked(chatRefinementStep).mock.calls[0][0].productName).toBe("Arturia Minilab 3");
    expect(result.suggestion).toBe("El Arturia Minilab 3 suma controles útiles.");
  });

  it("mantiene el color elegido por el CM al generar una nueva propuesta", async () => {
    state.brandName = "Arturia";
    state.productName = "Arturia MiniLab 3 Rose Quartz Controlador MIDI 25 Teclas";
    state.contextAssessment = { copilot: { goal: "RESPONDER" }, draftProductChoice: { productId: "product-1", chosenByCm: true } };
    vi.mocked(chatRefinementStep).mockResolvedValueOnce({
      message: "Nueva versión:",
      suggestion: "El Arturia MiniLab 3 Rose Quartz Controlador MIDI 25 Teclas suma controles útiles.",
    });

    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Hacela más clara", chatHistory: "[]", currentText: "Borrador" }));
    expect(vi.mocked(chatRefinementStep).mock.calls[0][0].productName).toBe("Arturia Minilab 3 Rose Quartz");
    expect(result.suggestion).toBe("El Arturia Minilab 3 Rose Quartz suma controles útiles.");
  });

  it("usa el fabricante Meike aunque el borrador anterior esté etiquetado MidiPlus", async () => {
    state.brandName = "MidiPlus";
    state.productName = "Teclado Meike MK137 Verde 37 Teclas Sensitivas Controlador MIDI";
    vi.mocked(chatRefinementStep).mockResolvedValueOnce({ message: "Nueva versión:", suggestion: "El Meike MK137 tiene 37 teclas." });
    const result = await sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Corregí la marca", chatHistory: "[]" }));
    expect(vi.mocked(chatRefinementStep).mock.calls[0][0]).toMatchObject({ brandName: "Meike", productName: "Meike Mk137" });
    expect(result.suggestion).toBe("El Meike Mk137 tiene 37 teclas.");
  });

  it("bloquea la propuesta del chat si combina MidiPlus con el modelo Meike", async () => {
    state.brandName = "MidiPlus";
    state.productName = "Teclado Meike MK137 Verde 37 Teclas Sensitivas Controlador MIDI";
    vi.mocked(chatRefinementStep).mockResolvedValueOnce({ message: "Nueva versión:", suggestion: "El MidiPlus MK137 tiene 37 teclas." });
    await expect(sendRefinementMessageAction(form({ responseId: "response-1", userMessage: "Acortala", chatHistory: "[]" }))).rejects.toThrow("mezcla la marca");
    expect(state.responses[0].chatHistory).toEqual([]);
  });

  it("guarda sin cambios el nombre escrito manualmente al usar una respuesta", async () => {
    state.brandName = "Arturia";
    state.productName = "Arturia MiniLab 3 Black Controlador MIDI 25 Teclas";
    const manualText = "Para mí, Arturia MiniLab 3 Black está bien para este caso.";

    await applyChatSuggestionAction(form({ responseId: "response-1", text: manualText, chatHistory: "[]" }));
    expect(state.responses[0].editedText).toBe(manualText);
  });

  it("acepta una propuesta algo más larga que el objetivo sin cortarla", async () => {
    const text = "a".repeat(COPILOT_TARGET_CHARACTERS + 20);
    await applyChatSuggestionAction(form({ responseId: "response-1", text, chatHistory: "[]" }));
    expect(state.responses[0].editedText).toBe(text);
  });

  it("no deja usar una propuesta que supera el tope del Asistente CM", async () => {
    await expect(applyChatSuggestionAction(form({ responseId: "response-1", text: "a".repeat(COPILOT_MAX_CHARACTERS + 1), chatHistory: "[]" }))).rejects.toThrow(String(COPILOT_MAX_CHARACTERS));
    expect(state.responses[0].editedText).toBe("");
  });

  it("rechaza respuestas de otro cliente", async () => {
    state.clientId = "client-2";
    await expect(applyChatSuggestionAction(form({ responseId: "response-1", text: "Propuesta", chatHistory: "[]" }))).rejects.toThrow("Sin acceso");
    expect(state.responses[0].editedText).toBe("");
  });
});
