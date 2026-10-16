import { describe, expect, it, vi } from "vitest";
import { buildSwipeSummary, multiplePhrase } from "../reel-craft";
import { weekBounds, weekStart, validWeekParam } from "../studio/week";

vi.mock("../db", () => ({ prisma: {} }));

const { fallbackPlan, rankedFormulasFor } = await import("../studio/weekly-plan-generator");

const ref = (id: string, title: string, multiple: number | null, formulaId?: number) => ({
  id,
  title,
  metadata: multiple === null ? {} : { reelCraft: { outlierMultiple: multiple, formulaId } },
});

describe("studio: semana", () => {
  it("arranca el lunes y tiene 7 días", () => {
    expect(weekStart("2026-10-16")).toBe("2026-10-12"); // viernes → lunes
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // domingo → lunes anterior
    const week = weekBounds("2026-10-14");
    expect(week.days).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("ignora parámetros inválidos", () => {
    expect(validWeekParam("2026-10-15")).toBe("2026-10-12");
    expect(validWeekParam("cualquier cosa")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("studio: lo que funciona en el rubro", () => {
  it("cuenta los ganchos del tercio de arriba con datos medidos", () => {
    const references = [
      ref("a", "Nadie te dice esto del bombo", 6, 3),
      ref("b", "Nadie te dice cómo grabar voces", 5, 3),
      ref("c", "Pads de goma vs malla", 4.5, 17),
      ref("d", "Mirá lo que hace este pad", 1, 18),
      ref("e", "Mirá cómo suena", 0.9, 18),
      ref("f", "Hermoso atardecer", 0.8),
      ref("g", "Mirá esto", 0.7, 18),
      ref("h", "Mirá el nuevo", 0.6, 18),
      ref("i", "Mirá otra vez", 0.5, 18),
    ];
    const summary = buildSwipeSummary(references);
    expect(summary.basis).toBe("medido");
    expect(summary.confidence).toBe("orientativo");
    expect(summary.formulas[0].formulaId).toBe(3);
    expect(summary.formulas[0].topCount).toBe(2);
    expect(summary.formulas.some((formula) => formula.formulaId === 18)).toBe(false);
  });

  it("sin vistas medidas, avisa que es estimado", () => {
    expect(buildSwipeSummary([ref("a", "Nadie te dice esto", null)]).basis).toBe("estimado");
  });

  it("explica el múltiplo sin jerga", () => {
    expect(multiplePhrase(4)).toBe("le fue 4 veces mejor que de costumbre");
    expect(multiplePhrase(1)).toBe("le fue como de costumbre");
    expect(multiplePhrase(null)).toBeNull();
  });
});

describe("studio: plan semanal sin IA", () => {
  it("reparte piezas en días libres, sin repetir producto y con ganchos del producto", () => {
    const week = weekBounds("2026-10-12");
    const products = [{ id: "p1", name: "MiniLab 3" }, { id: "p2", name: "Batería ED6" }, { id: "p3", name: "Micrófono BM800" }];
    const plan = fallbackPlan({ days: week.days, freeDayIndexes: [0, 2, 4], products, swipe: null, count: 3 });
    expect(plan.map((piece) => piece.day)).toEqual(["2026-10-12", "2026-10-14", "2026-10-16"]);
    expect(new Set(plan.map((piece) => piece.productId)).size).toBe(3);
    expect(plan.map((piece) => piece.pieceType)).toEqual(["REEL", "CAROUSEL", "REEL"]);
    expect(plan.every((piece) => piece.hook.length > 0)).toBe(true);
  });

  it("prioriza los ganchos que funcionan en el rubro", () => {
    const swipe = buildSwipeSummary([ref("a", "x", 6, 3), ref("b", "y", 5, 3), ref("c", "z", 1, 18), ref("d", "w", 1, 18), ref("e", "v", 1, 18), ref("f", "u", 1, 18)]);
    expect(rankedFormulasFor("SALE", swipe)[0].id).toBe(3);
  });
});

describe("studio: cuentas de referencia", async () => {
  const { parseReferenceAccount } = await import("../studio/reference-accounts");
  it("reconoce links de las tres redes", () => {
    expect(parseReferenceAccount("https://www.instagram.com/pcmidicenter/?hl=es")).toEqual({ platform: "INSTAGRAM", handle: "pcmidicenter", url: "https://www.instagram.com/pcmidicenter/" });
    expect(parseReferenceAccount("tiktok.com/@Bateria.Facil")?.handle).toBe("bateria.facil");
    expect(parseReferenceAccount("https://youtube.com/@ArturiaOfficial/shorts")).toMatchObject({ platform: "YOUTUBE", handle: "ArturiaOfficial" });
    expect(parseReferenceAccount("https://www.youtube.com/channel/UCabc123")?.url).toBe("https://www.youtube.com/channel/UCabc123");
  });
  it("acepta @usuario con la red elegida y rechaza links de publicaciones", () => {
    expect(parseReferenceAccount("@midiplus", "TIKTOK")).toMatchObject({ platform: "TIKTOK", handle: "midiplus" });
    expect(parseReferenceAccount("https://www.instagram.com/reel/ABC123/")).toBeNull();
    expect(parseReferenceAccount("https://example.com/algo")).toBeNull();
  });
});

describe("studio: formatos y resultados", async () => {
  const { carouselFromScript, shortCover, storiesFromScript } = await import("../studio/piece-formats");
  const { summarizeResults, ownBestFormulas, multipleOwnPhrase } = await import("../studio/results");

  it("arma un carrusel base desde el guion", () => {
    const carousel = carouselFromScript("Tres ajustes del KeyLab que te ahorran tiempo todos los días en casa", "Uno.\nDos.\n\nTres.", "Guardalo.");
    expect(carousel.cover.split(" ").length).toBeLessThanOrEqual(9);
    expect(carousel.slides.map((slide) => slide.body)).toEqual(["Uno.", "Dos.", "Tres."]);
    expect(carousel.lastSlide).toBe("Guardalo.");
    expect(shortCover("Corto")).toBe("Corto");
    expect(storiesFromScript("¿Te pasa?", "")).toHaveLength(3);
  });

  const piece = (id: string, views: number | null, formulaId: number | null, pieceType = "REEL") => ({ id, hook: id, pieceType, formulaId, metrics: views == null ? null : { views, reach: null, likes: null, comments: null, saves: null, shares: null, source: "MANUAL", capturedAt: new Date() } });

  it("compara cada pieza con la mediana propia", () => {
    const summary = summarizeResults([piece("a", 1000, 3), piece("b", 2000, 3), piece("c", 4000, 17), piece("d", null, 3)]);
    expect(summary.ownMedian).toBe(2000);
    expect(summary.rows.find((row) => row.id === "c")?.multiple).toBe(2);
    expect(summary.enoughData).toBe(false);
    expect(summary.byFormula).toEqual([]);
    expect(multipleOwnPhrase(2)).toBe("2 veces tu promedio");
  });

  it("con 8 piezas medidas aprende qué gancho funciona", () => {
    const pieces = [piece("a", 9000, 3), piece("b", 8000, 3), piece("c", 1000, 17), piece("d", 1200, 17), piece("e", 1100, 18), piece("f", 900, 18), piece("g", 7000, 3, "CAROUSEL"), piece("h", 1000, 17)];
    const summary = summarizeResults(pieces);
    expect(summary.enoughData).toBe(true);
    expect(summary.byFormula[0].key).toBe("3");
    expect(ownBestFormulas(summary)).toEqual([3]);
  });
});

describe("studio: retroalimentación", () => {
  it("los resultados propios van antes que el rubro", () => {
    const swipe = buildSwipeSummary([ref("a", "x", 6, 3), ref("b", "y", 5, 3), ref("c", "z", 1, 18), ref("d", "w", 1, 18), ref("e", "v", 1, 18), ref("f", "u", 1, 18)]);
    const ranked = rankedFormulasFor("SALE", swipe, [20]).map((formula) => formula.id);
    expect(ranked.slice(0, 2)).toEqual([20, 3]);
    expect(new Set(ranked).size).toBe(ranked.length);
  });
});

describe("studio: Instagram", async () => {
  const { instagramShortcode } = await import("../instagram-insights");
  it("cruza links con o sin usuario y parámetros", () => {
    expect(instagramShortcode("https://www.instagram.com/reel/DAbc-12_x/?igsh=xyz")).toBe("DAbc-12_x");
    expect(instagramShortcode("https://instagram.com/pcmidicenter/p/C9zz/")).toBe("C9zz");
    expect(instagramShortcode("https://www.tiktok.com/@x/video/1")).toBeNull();
  });
});

describe("studio: textos de carrusel", async () => {
  const { asCarouselText } = await import("../studio/piece-formats");
  it("no habla de reel en un carrusel", () => {
    expect(asCarouselText("Guardá este reel para tu próxima sesión.")).toBe("Guardá este carrusel para tu próxima sesión.");
    expect(asCarouselText("Mirá el video completo")).toBe("Mirá el carrusel completo");
  });
});
