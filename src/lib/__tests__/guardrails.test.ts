import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

beforeEach(() => vi.resetModules());

async function detect(text: string, currentId = "pcmidi") {
  const { detectCrossClientTerms } = await import("../guardrails");
  const clients = [
    { id: "pcmidi", name: "PC MIDI Center", slug: "pcmidi", domainKeywords: JSON.stringify(["Órgano y Piano", "piano digital", "teclado musical", "controlador midi"]), brands: [{ name: "MIDIPLUS" }, { name: "KRESSMER" }] },
    { id: "kressmer", name: "Kressmer", slug: "kressmer", domainKeywords: JSON.stringify(["piano", "teclado", "teclado musical"]), brands: [{ name: "Kressmer" }] },
    { id: "prestige", name: "Prestige Running", slug: "prestige-running", domainKeywords: JSON.stringify(["running", "rozaduras"]), brands: [{ name: "Prestige" }] },
  ];
  const db = { client: { findMany: vi.fn(async () => clients) } } as unknown as PrismaClient;
  return detectCrossClientTerms(db, currentId, text);
}

describe("mezcla de clientes con dominios compartidos", () => {
  it("permite piano y teclado en una propuesta de PC MIDI", async () => {
    expect(await detect("Para practicar piano, revisá el teclado musical Midiplus.")).toEqual([]);
  });
  it("permite una marca que pertenece también al catálogo del cliente actual", async () => {
    expect(await detect("Consultá por el piano Kressmer.")).toEqual([]);
  });
  it("sigue detectando marcas y temas ajenos", async () => {
    expect(await detect("Prestige Running ayuda con las rozaduras.")).toEqual([expect.stringContaining("prestige-running:")]);
  });
  it("no comparte el dominio musical con un cliente de running", async () => {
    expect(await detect("Un piano Kressmer", "prestige")).toContainEqual(expect.stringContaining("kressmer:"));
  });
  it("respeta límites de palabra al reconocer términos propios", async () => {
    expect(await detect("El pianola está bien.")).toEqual([]);
  });
  it("un cliente sin contexto propio no recibe exenciones", async () => {
    expect(await detect("Piano Kressmer", "unknown")).toContainEqual(expect.stringContaining("kressmer:"));
  });
});
