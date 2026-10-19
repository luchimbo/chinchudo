import { describe, expect, it, vi } from "vitest";
import { argentinaDayStart, commentPublishedAt, detectKressmerLanguage, kressmerCommentReason, kressmerDailyProgress, kressmerCorrection, kressmerDraftClaimErrors, kressmerModelCode, kressmerSearchMode, kressmerVideoOffset, KRESSMER_QUERIES, youtubeCommentIdentity } from "../kressmer-radar";
// @ts-ignore -- exercise the operational TypeScript ESM entrypoint directly.
import { findExistingOpportunity, normalizeSourceUrlForDedupe } from "../../../scripts/import-opportunities.mts";

const now = new Date("2026-10-19T18:00:00Z");
const row = { channel: "youtube", sourceType: "youtube_comment", sourceUrl: "https://youtube.com/watch?v=video&lc=UgxOne", sourceText: "¿Qué piano digital recomiendan para aprender?", publishedTime: "hace 2 días", captured_at_utc: now.toISOString() };

describe("Kressmer comment eligibility", () => {
  it.each([
    [row.sourceText, "es"], ["Which digital piano should I buy for learning?", "en"],
    ["Welches Digitalpiano kann ich für Anfänger kaufen?", "de"],
    ["Qual piano digital vocês recomendam para aprender?", "other"], ["Piano 👍", "other"],
  ])("detects the comment language: %s", (text, language) => expect(detectKressmerLanguage(text)).toBe(language));
  it("accepts a specific need and rejects noise, unrelated products and videos", () => {
    expect(kressmerCommentReason(row, now)).toBeNull();
    expect(kressmerCommentReason({ ...row, sourceText: "Qué buen piano, muchas gracias por el video" }, now)).toBe("no_concrete_need");
    expect(kressmerCommentReason({ ...row, sourceText: "Which gaming keyboard should I buy?" }, now)).toBe("spam_or_unrelated");
    expect(kressmerCommentReason({ ...row, sourceText: "Which audio interface should I buy?" }, now)).toBe("outside_pianos_and_keyboards");
    expect(kressmerCommentReason({ ...row, sourceType: "youtube_video" }, now)).toBe("not_identifiable_youtube_comment");
    expect(kressmerCommentReason({ ...row, channel: "reddit" }, now)).toBe("not_identifiable_youtube_comment");
  });
  it.each(["hace 30 días", "hace 11 meses", "11 months ago", "vor 11 Monaten", "hace 365 días"])("accepts comments up to one year old: %s", publishedTime => {
    expect(kressmerCommentReason({ ...row, publishedTime }, now)).toBeNull();
  });
  it.each(["hace 366 días", "hace 1 año", "1 year ago", "vor einem Jahr", "hace 12 meses", "", "unknown", "2026-10-20"])("rejects old, missing or future dates: %s", publishedTime => {
    expect(kressmerCommentReason({ ...row, publishedTime }, now)).toBe("unknown_or_old_date");
  });
  it("does not rejuvenate relative timestamps when replaying staging", () => {
    expect(kressmerCommentReason({ ...row, captured_at_utc: "2025-09-01T18:00:00Z" }, now)).toBe("unknown_or_old_date");
    expect(commentPublishedAt("vor 2 Wochen", now)?.toISOString()).toBe("2026-10-05T18:00:00.000Z");
  });
  it("preserves comment identity across URL formats without collapsing a whole video", () => {
    const hash = "https://www.youtube.com/watch?v=video#comment-UgxOne";
    expect(youtubeCommentIdentity(hash)?.url).toBe("https://www.youtube.com/watch?v=video&lc=UgxOne");
    expect(normalizeSourceUrlForDedupe("youtube", hash)).toBe(normalizeSourceUrlForDedupe("youtube", row.sourceUrl + "&utm_source=test"));
    expect(normalizeSourceUrlForDedupe("youtube", hash)).not.toBe(normalizeSourceUrlForDedupe("youtube", row.sourceUrl.replace("UgxOne", "UgxTwo")));
    expect(youtubeCommentIdentity("https://youtube.com/watch?v=video#comment-0")).toBeNull();
    expect(youtubeCommentIdentity("https://evil.example/watch?v=video&lc=UgxOne")).toBeNull();
  });
  it("rotates all three languages without requiring fixed per-language quotas", () => {
    expect([...new Set(KRESSMER_QUERIES.map(item => item.language))]).toEqual(["es", "en", "de"]);
  });
  it("rolls the daily cohort at Argentine midnight", () => {
    expect(argentinaDayStart(new Date("2026-10-20T02:59:59Z")).toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(argentinaDayStart(new Date("2026-10-20T03:00:00Z")).toISOString()).toBe("2026-10-20T03:00:00.000Z");
  });
  it("separates valid new opportunities from ready answers and legacy rows", async () => {
    const metadata = { kressmerRadar: { version: 1, language: "en", publishedAt: "2026-10-18T12:00:00Z", commentKey: "v:c" } };
    const findMany = vi.fn().mockResolvedValue([
      { id: "pending", contextAssessment: metadata, responses: [] },
      { id: "ready", contextAssessment: metadata, responses: [{ draftText: "For learning, a digital piano with weighted keys can help.", editedText: "" }] },
      { id: "wrong-language", contextAssessment: metadata, responses: [{ draftText: "Para aprender, un piano digital con teclas sensibles puede ayudar.", editedText: "" }] },
      { id: "legacy", contextAssessment: {}, responses: [] },
    ]);
    expect(await kressmerDailyProgress({ opportunity: { findMany } } as any, "kressmer", argentinaDayStart(now), now))
      .toEqual({ opportunities: 3, ready: 1, pendingIds: ["pending", "wrong-language"] });
    expect(findMany.mock.calls[0][0].where.createdAt.gte).toEqual(argentinaDayStart(now));
  });
  it.each(["Kressmer has 88 weighted keys.", "Kressmer ofrece teclas contrapesadas.", "Kressmer bietet 88 Tasten.", "Available now, in stock.", "Sofort lieferbar für 300 EUR.", "El Yamaha PSR-E383 es una opción muy sólida para empezar."])("blocks unsupported claims: %s", text => {
    expect(kressmerDraftClaimErrors(text, []).length).toBeGreaterThan(0);
  });
  // Live preview draft for "¿qué tal es el Yamaha PSR-E383?": no model named, but it still invents the instrument's specs.
  const liveDraft = "Es un teclado muy popular para empezar, pero al ser de 61 teclas no es ideal si buscás una experiencia cercana al piano clásico. Para aprender con mejor sonido y peso en las teclas, un piano digital de 88 teclas suele ser más recomendable.";
  it.each([
    liveDraft,
    "Tiene 61 teclas y no son sensibles.", "Sí, es una buena opción para principiantes.", "Ese teclado trae parlantes chicos.",
    "Sus teclas no tienen peso.", "It's a solid keyboard for beginners.", "It's great for learning.", "Since it has 61 keys, it won't feel like a piano.",
    "This model lacks weighted keys.", "Its speakers are weak.", "Es ist ein gutes Keyboard für Anfänger.", "Da es nur 61 Tasten hat, ist es begrenzt.",
    "Dieses Modell hat keine gewichteten Tasten.", "Das Casio klingt gut.",
  ])("blocks implicit attributes of the consulted instrument without catalog: %s", text => {
    expect(kressmerDraftClaimErrors(text, [])).toContain(text === "Das Casio klingt gut." ? "unverified_third_party_product" : "unverified_implicit_attribute");
  });
  it("general guidance is never flagged as describing the consulted instrument", () => {
    for (const text of [
      "Para estudiar piano, compará tacto, cantidad de teclas y pedal.",
      "Un piano digital de 88 teclas con peso suele ser más cómodo para estudiar repertorio clásico. ¿Qué querés tocar?",
      "Es importante elegir un piano con teclas sensibles al tacto. Tiene sentido probarlo con auriculares antes de decidir.",
      "Es bueno probar el tacto antes de comprar, y conviene confirmar si incluye pedal.",
      "For classical practice, compare key action, key count and pedal support. What style do you want to learn?",
      "It's worth checking whether the keys are weighted; it's good to try them with headphones.",
      "Zum Klavierlernen lohnt es sich, Anschlag, Tastenanzahl und Pedal zu vergleichen. Es ist wichtig, vorher zu testen.",
    ]) expect(kressmerDraftClaimErrors(text, [])).not.toContain("unverified_implicit_attribute");
  });
});

// Shortened from the real catalogue sheets, including the lines that list what must NOT be claimed.
const CATALOG = [
  { name: "Kressmer K-180 Piano Digital 88 Teclas Blanco 128 Tonos", description: "Piano digital Kressmer K-180 de 88 teclas standard sensibles a la velocidad, color blanco. Orientado a estudiantes y práctica en casa.",
    technicalSpecs: "- 88 teclas sensibles a la velocidad\n- 128 tonos\n- Salida para auriculares\nPrecisiones: No declarar acción martillo ni Bluetooth." },
  { name: "Kressmer K-88 Piano Digital 88 Teclas Rojo Hammer Action", description: "Piano digital Kressmer K-88 de 88 teclas con acción tipo martillo, color rojo.",
    technicalSpecs: "- 88 teclas con acción martillo\n- Salida para auriculares" },
  { name: "Kressmer 3008 Piano Digital Modular 88 Teclas Portable", description: "Piano digital modular Kressmer 3008 de 88 teclas sensibles a la velocidad. Se divide en dos secciones con conexión magnética.",
    technicalSpecs: "- 88 teclas sensibles a la velocidad\n- 600 timbres\nOpcionales (no incluidos de serie): Bluetooth Dual opcional\nPrecisiones: No declarar acción martillo." },
];

describe("Kressmer replies recommend Kressmer with verified sheet data", () => {
  it.each([
    "Para estudiar repertorio clásico conviene priorizar el tacto; el Kressmer K-88 tiene 88 teclas con acción martillo.",
    "For practising at night, the Kressmer K-180 has a headphone output and 88 velocity-sensitive keys.",
    "Wenn du wenig Platz hast, ist das modulare Kressmer 3008 mit zwei Teilen eine Option.",
    "Si buscás algo para empezar, mirá el Kressmer K-180: teclas sensibles a la velocidad y 128 tonos para practicar.",
  ])("accepts a Kressmer recommendation backed by its sheet: %s", text => {
    expect(kressmerDraftClaimErrors(text, CATALOG)).toEqual([]);
  });
  it.each([
    ["Para estudiar piano, compará tacto, cantidad de teclas y pedal.", "missing_kressmer_recommendation"],
    ["El Kressmer K-180 tiene acción martillo.", "unverified_kressmer_spec"],
    ["El Kressmer 3008 trae Bluetooth para conectar el celular.", "unverified_kressmer_spec"],
    ["El Kressmer K-180 tiene 600 tonos.", "unverified_kressmer_spec"],
    ["Los pianos Kressmer tienen acción martillo.", "unverified_kressmer_spec"],
    ["Te recomiendo el Kressmer K-500.", "uncatalogued_model_recommendation"],
    ["El Kressmer K-88 es mejor que el Yamaha P-145.", "unverified_third_party_product"],
    ["Es un teclado muy popular, pero al ser de 61 teclas se queda corto. Mirá el Kressmer K-88.", "unverified_implicit_attribute"],
    ["El Kressmer K-88 está en stock a 500 USD.", "unverified_commercial_claim"],
  ])("blocks %s", (text, error) => {
    expect(kressmerDraftClaimErrors(text, CATALOG)).toContain(error);
  });
  it("without catalogue it still requires naming Kressmer, but no attributes", () => {
    expect(kressmerDraftClaimErrors("Una opción a considerar es Kressmer.", [])).toEqual([]);
    expect(kressmerDraftClaimErrors("Kressmer tiene teclas contrapesadas.", [])).toContain("unverified_kressmer_attribute");
    expect(kressmerDraftClaimErrors("Compará tacto y pedal.", [])).toContain("missing_kressmer_recommendation");
  });
  it("names the model code the catalogue uses", () => {
    expect(CATALOG.map(entry => kressmerModelCode(entry.name))).toEqual(["k180", "k88", "3008"]);
    expect(kressmerModelCode("Piano Digital Modular Kressmer 3008 88 Teclas Sensitivas Bluetooth")).toBe("3008");
  });
  it("tells the retry exactly what was wrong", () => {
    expect(kressmerCorrection(["missing_kressmer_recommendation", "unverified_kressmer_spec"])).toMatch(/Kressmer <modelo>.*ficha/);
  });
});

describe("concurrent import dedupe", () => {
  it("finds a comment already imported by another pipeline under a different URL form", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "other-comment", sourceUrl: "https://www.youtube.com/watch?v=video&lc=UgxTwo" },
      { id: "same", sourceUrl: "https://youtu.be/video?lc=UgxOne&t=4" },
    ]);
    expect(await findExistingOpportunity({ opportunity: { findMany } } as any, "youtube", "https://www.youtube.com/watch?v=video&lc=UgxOne"))
      .toEqual(expect.objectContaining({ id: "same" }));
    expect(JSON.stringify(findMany.mock.calls[0][0].where)).toContain("lc=UgxOne");
  });
  it("does not treat another comment on the same video as a duplicate", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "other", sourceUrl: "https://www.youtube.com/watch?v=video&lc=UgxTwo" }]);
    expect(await findExistingOpportunity({ opportunity: { findMany } } as any, "youtube", "https://www.youtube.com/watch?v=video&lc=UgxOne")).toBeNull();
  });
});

describe("Kressmer search rotation", () => {
  it("uses the best-yield filter first, then the others, then deeper result blocks", () => {
    const pass = KRESSMER_QUERIES.length;
    expect([0, pass, 2 * pass, 3 * pass].map(kressmerSearchMode)).toEqual(["popular", "any", "recent_month", "popular"]);
    expect([0, 2 * pass, 3 * pass, 6 * pass, 9 * pass].map(kressmerVideoOffset)).toEqual([0, 0, 6, 12, 0]);
    expect(new Set(KRESSMER_QUERIES.map(item => item.query)).size).toBe(KRESSMER_QUERIES.length);
    expect(KRESSMER_QUERIES.filter(item => item.language === "de")).toHaveLength(18);
  });
});

describe("Kressmer concrete need", () => {
  const live = (sourceText: string) => kressmerCommentReason({ ...row, sourceText }, now);
  it.each([
    "I want a digital piano for my daughter, the cheaper ones are hard to afford",
    "Is the more expensive keyboard worth it for a beginner",
    "Quiero empezar a tocar piano y no sé si vale la pena un teclado de 61 teclas",
    "Für meine Tochter überlege ich ein Digitalpiano zu kaufen, lohnt sich das",
  ])("accepts buying or choosing intent without a question mark: %s", text => expect(live(text)).toBeNull());
  it.each([
    "The second piano sounds so much better, comparable to a Nord",
    "Wow, my favorite piano, thanks for playing for me",
    "Qué lindo suena ese piano, gracias por el video",
  ])("still rejects praise and opinions: %s", text => expect(live(text)).toBe("no_concrete_need"));
});

describe("import dedupe for non-comment posts", () => {
  it("keeps the original rule: any stored URL with the same post key is a duplicate", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "post", sourceUrl: "https://www.reddit.com/r/piano/comments/abc123/which_piano/?utm=x" }]);
    expect(await findExistingOpportunity({ opportunity: { findMany } } as any, "reddit", "https://www.reddit.com/r/piano/comments/abc123/which_piano/"))
      .toEqual(expect.objectContaining({ id: "post" }));
  });
});
