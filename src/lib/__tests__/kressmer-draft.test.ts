import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../llm-provider", () => ({ resolveLLMConfig: () => ({ apiKey: "test", model: "test", provider: "openrouter" }), fetchChatCompletion: vi.fn() }));
import { fetchChatCompletion } from "../llm-provider";
import { generateAICopilotDraft } from "../ai-draft-generator";
const ctx = { client: { id: "k", slug: "kressmer", name: "Kressmer" }, brand: { name: "Kressmer" }, persona: { name: "Educativo" }, catalogProducts: [],
  opportunity: { id: "o", sourceText: "Welches Digitalpiano kann ich für Anfänger kaufen?", channel: { name: "YouTube" }, detectedProduct: null } } as any;
const completion = (text: string) => ({ response: { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ text, riskNotes: "Revisar" }) } }] }) }, config: { model: "test", provider: "openrouter" } }) as any;
describe("Kressmer single draft", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns exactly one German proposal", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Für Anfänger ist das Spielgefühl wichtig. Welche Musik möchtest du lernen?"));
    const result = await generateAICopilotDraft(ctx);
    expect(result?.variantType).toBe("SHORT");
    expect(result?.draftText).toContain("Für Anfänger");
    expect(fetchChatCompletion).toHaveBeenCalledTimes(1);
  });
  it("retries a mismatched language then leaves pending without a Spanish fallback", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Para aprender, un piano digital con teclas sensibles puede ayudar."));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
  });
  it("leaves pending when the provider fails", async () => {
    vi.mocked(fetchChatCompletion).mockRejectedValue(new Error("offline"));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
  });
  it("rejects invented catalog specifications", async () => {
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion("Kressmer bietet 88 Tasten und ist für Anfänger perfekt."));
    expect(await generateAICopilotDraft(ctx)).toBeNull();
  });
  it("rejects the live draft that rates the consulted keyboard without naming it", async () => {
    const live = "Es un teclado muy popular para empezar, pero al ser de 61 teclas no es ideal si buscás una experiencia cercana al piano clásico. Para aprender con mejor sonido y peso en las teclas, un piano digital de 88 teclas suele ser más recomendable.";
    vi.mocked(fetchChatCompletion).mockResolvedValue(completion(live));
    const spanish = { ...ctx, opportunity: { ...ctx.opportunity, sourceText: "gracias por el vid, que tal es el Yamaha PSR-E383 ?" } };
    expect(await generateAICopilotDraft(spanish)).toBeNull();
    expect(fetchChatCompletion).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(fetchChatCompletion).mock.calls[1])).toContain("instrumento consultado");
  });
  it("accepts general Spanish guidance for the same comment after a correction", async () => {
    vi.mocked(fetchChatCompletion)
      .mockResolvedValueOnce(completion("Es un teclado popular, pero tiene 61 teclas."))
      .mockResolvedValueOnce(completion("Para estudiar piano, compará el tacto, la cantidad de teclas y si admite pedal. ¿Qué te gustaría tocar?"));
    const spanish = { ...ctx, opportunity: { ...ctx.opportunity, sourceText: "gracias por el vid, que tal es el Yamaha PSR-E383 ?" } };
    expect((await generateAICopilotDraft(spanish))?.draftText).toContain("compará el tacto");
  });
});
