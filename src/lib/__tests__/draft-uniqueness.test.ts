import { describe, expect, it } from "vitest";
import { draftSimilarity, findSimilarDraft, normalizeDraftText } from "../draft-uniqueness";

describe("draft uniqueness", () => {
  it("normaliza mayusculas, acentos y puntuacion", () => {
    expect(normalizeDraftText("¡Fijáte estas medias, che!")).toBe("fijate estas medias che");
  });

  it("detecta copias y parafrasis demasiado cercanas", () => {
    const original = "Fijate las medias Prestige para trail porque ajustan bien y ayudan a evitar el roce durante recorridos largos";
    const nearCopy = "Fijate las medias Prestige para trail: ajustan bien y ayudan a evitar el roce durante recorridos largos";
    expect(draftSimilarity(original, nearCopy)).toBeGreaterThan(0.78);
    expect(findSimilarDraft(nearCopy, [original])).not.toBeNull();
  });

  it("acepta respuestas realmente diferentes", () => {
    const original = "Para trail priorizaria un ajuste firme que no se mueva dentro de la zapatilla";
    const different = "En tiradas largas, el secado rapido resulta especialmente util cuando cambia el clima";
    expect(findSimilarDraft(different, [original])).toBeNull();
  });
});
