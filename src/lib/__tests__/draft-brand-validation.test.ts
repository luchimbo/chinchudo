import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logger", () => ({ logger: { info: vi.fn(async () => {}), error: vi.fn(async () => {}) } }));
vi.mock("../llm-provider", () => ({
  resolveLLMConfig: () => ({ apiKey: "test", model: "test", provider: "openrouter" }),
  resolveOpenRouterConfig: () => ({ apiKey: "test", model: "test", provider: "openrouter" }),
  fetchChatCompletion: vi.fn(),
}));
import { fetchChatCompletion } from "../llm-provider";
import { generateAICopilotDraft, generateAIDrafts } from "../ai-draft-generator";

const brand = { id: "meike", name: "Meike", clientId: "pcmidi" };
const product = { id: "m25", name: "Controlador MIDI Meike M25 25 Teclas Sensitivo USB", category: "controladores-midi", brandId: brand.id, brand, description: "Controlador compacto de 25 teclas", useCases: "Controlar instrumentos virtuales", technicalSpecs: "25 teclas", warrantyNotes: "" };
const ctx = {
  brand, client: { id: "pcmidi", slug: "pcmidi", name: "PC MIDI Center" },
  persona: { name: "Técnico" }, catalogProducts: [product],
  opportunity: { id: "opp", sourceText: "Busco un teclado Meike M25", detectedProduct: product, detectedBrand: brand, detectedIntent: "PURCHASE_QUESTION", channel: { name: "YouTube" } },
} as any;

function completion(value: unknown) {
  return { response: { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) }, config: { model: "test", provider: "openrouter" } } as any;
}

describe("validación de fabricante en la salida real de IA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rechaza MidiPlus M25 y reintenta con la pareja Meike M25", async () => {
    vi.mocked(fetchChatCompletion)
      .mockResolvedValueOnce(completion({ text: "El MidiPlus M25 tiene 25 teclas." }))
      .mockResolvedValueOnce(completion({ text: "El Meike M25 tiene 25 teclas." }));
    const result = await generateAICopilotDraft(ctx);
    expect(result?.draftText).toBe("El Meike M25 tiene 25 teclas.");
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(fetchChatCompletion).mock.calls[1][1])).toContain("La marca y el modelo no corresponden");
  });

  it("no devuelve un borrador publicable si la IA insiste con la marca equivocada", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion({ text: "El MidiPlus M25 tiene 25 teclas." }));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
  });

  it("aplica el mismo bloqueo en las tres variantes clásicas", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion({ variants: [
      { type: "SHORT", text: "El MidiPlus M25 tiene 25 teclas." },
      { type: "TECHNICAL", text: "El Meike M25 tiene 25 teclas." },
      { type: "CONVERSATIONAL", text: "El Meike M25 es compacto." },
    ] }));
    expect(await generateAIDrafts(ctx)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
  });
});
