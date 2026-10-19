import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../llm-provider", () => ({ resolveLLMConfig: () => ({ apiKey: "test", model: "test", provider: "openrouter" }), fetchChatCompletion: vi.fn() }));
import { fetchChatCompletion } from "../llm-provider";
import { buildCopilotPrompt, generateAICopilotDraft } from "../ai-draft-generator";
const brand = { id: "b", clientId: "k", name: "Kressmer" };
const product = (id: string, name: string, description: string, technicalSpecs: string) => ({
  id, brandId: "b", name, category: "pianos-digitales", description, technicalSpecs, useCases: "Estudio y práctica en casa.",
  warrantyNotes: "", stockStatus: "Por confirmar", priceRange: "Por confirmar", sourceType: "catalog_copy", sourceExternalId: null, sourceUrl: "", brand,
});
const catalogProducts = [
  product("k88", "Kressmer K-88 Piano Digital 88 Teclas Rojo Hammer Action", "Piano digital Kressmer K-88 de 88 teclas con acción tipo martillo, color rojo.", "- 88 teclas con acción martillo\n- Salida para auriculares"),
  product("k180", "Kressmer K-180 Piano Digital 88 Teclas Blanco 128 Tonos", "Piano digital Kressmer K-180 de 88 teclas sensibles a la velocidad, color blanco.", "- 88 teclas sensibles a la velocidad\n- 128 tonos\nPrecisiones: No declarar acción martillo."),
];
const ctx = { client: { id: "k", slug: "kressmer", name: "Kressmer" }, brand, persona: { name: "Educativo" }, catalogProducts,
  opportunity: { id: "o", sourceText: "Welches Digitalpiano kann ich für Anfänger kaufen?", channel: { name: "YouTube" }, detectedProduct: null } } as any;
const spanish = { ...ctx, opportunity: { ...ctx.opportunity, sourceText: "gracias por el vid, que tal es el Yamaha PSR-E383 ?" } };
const completion = (text: string) => ({ response: { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text, riskNotes: "Revisar" }) } }] }) }, config: { model: "test", provider: "openrouter" } }) as any;
const promptOf = (call: number) => JSON.stringify(vi.mocked(fetchChatCompletion).mock.calls[call]);

describe("Kressmer single draft", () => {
  beforeEach(() => vi.clearAllMocks());
  it("asks for a concrete Kressmer model from the catalogue and shows its sheet", () => {
    const prompt = buildCopilotPrompt(spanish);
    expect(prompt).toContain("Recomendá UN modelo de la lista");
    expect(prompt).not.toContain("NO la menciones");
    expect(prompt).toContain("Kressmer K-88");
    expect(prompt).toMatch(/No nombres, evalúes ni compares otras marcas/);
  });
  it("returns exactly one German proposal that recommends a Kressmer model", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Für Anfänger ist das Spielgefühl wichtig; das Kressmer K-88 hat 88 Tasten mit Hammermechanik. Welche Musik möchtest du lernen?"));
    const result = await generateAICopilotDraft(ctx);
    expect(result?.variantType).toBe("SHORT");
    expect(result?.draftText).toContain("Kressmer K-88");
    expect(fetchChatCompletion).toHaveBeenCalledTimes(1);
  });
  it("rejects a reply that never names Kressmer and asks for a model on the retry", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Für Anfänger ist das Spielgefühl wichtig. Welche Musik möchtest du lernen?"));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toContain("Kressmer <modelo>");
  });
  it("retries a mismatched language then leaves pending without a Spanish fallback", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Para aprender, el Kressmer K-180 tiene teclas sensibles a la velocidad."));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
  });
  it("leaves pending when the provider fails", async () => {
    vi.mocked(fetchChatCompletion).mockRejectedValue(new Error("offline"));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
  });
  it("rejects a feature the model's sheet does not confirm", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Das Kressmer K-180 hat eine Hammermechanik und ist für Anfänger gut."));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
    expect(promptOf(1)).toContain("ficha");
  });
  it("rejects the live draft that rates the consulted keyboard, even with Kressmer added", async () => {
    const live = "Es un teclado muy popular para empezar, pero al ser de 61 teclas no es ideal si buscás una experiencia cercana al piano clásico. Mirá el Kressmer K-88.";
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion(live));
    expect(await generateAICopilotDraft(spanish)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toContain("instrumento que consultó");
  });
  it("accepts guidance plus a Kressmer recommendation after a correction", async () => {
    vi.mocked(fetchChatCompletion)
      .mockResolvedValueOnce(completion("Es un teclado popular, pero tiene 61 teclas."))
      .mockResolvedValueOnce(completion("Para estudiar piano clásico conviene priorizar el tacto: el Kressmer K-88 tiene 88 teclas con acción martillo. ¿Qué te gustaría tocar?"));
    expect((await generateAICopilotDraft(spanish))?.draftText).toContain("Kressmer K-88");
  });
});
