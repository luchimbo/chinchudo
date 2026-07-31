import { describe, expect, it } from "vitest";
// @ts-ignore -- operational ESM helper is exercised directly by this test.
import { isPrestigeRadarCandidate, normalizedRadarText, PRESTIGE_RADAR_QUERIES } from "../prestige-radar.mjs";

describe("Prestige radar", () => {
  it("cubre las seis redes y temas de running", () => {
    expect(new Set(PRESTIGE_RADAR_QUERIES.map((query: { channel: string }) => query.channel))).toEqual(new Set(["instagram", "tiktok", "youtube", "facebook", "x", "reddit"]));
    expect(PRESTIGE_RADAR_QUERIES).toHaveLength(32);
  });

  it("acepta una conversación accionable y descarta venta o consulta médica", () => {
    expect(isPrestigeRadarCandidate("Estoy empezando a correr y se me hacen ampollas, ¿qué recomiendan para entrenar más cómodo?")).toBe(true);
    expect(isPrestigeRadarCandidate("Vendo medias deportivas al por mayor, envío a todo el país")).toBe(false);
    expect(isPrestigeRadarCandidate("¿Qué media me cura una lesión de gemelo?")).toBe(false);
  });

  it("normaliza contenido para deduplicar", () => {
    expect(normalizedRadarText("¡Medias técnicas para RUNNING!")).toBe("medias tecnicas para running");
  });
});
