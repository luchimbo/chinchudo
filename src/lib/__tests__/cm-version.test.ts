import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadCMVersion } from "../cm-version";

function fixture() {
  const client = { id: "client", slug: "pcmidi", name: "PC MIDI", responsePolicy: { tone: "directo" }, openrouterModel: "model" };
  const product = { id: "product", name: "Controlador", stockStatus: "Por confirmar", updatedAt: new Date(0), sourceSnapshotAt: new Date(0) };
  const prompt = { id: "prompt", systemPrompt: "No inventar precios", active: true, updatedAt: new Date(0) };
  const empty = () => ({ findMany: vi.fn(async () => []) });
  const db = {
    client: { findUniqueOrThrow: vi.fn(async () => client) },
    product: { findMany: vi.fn(async () => [product]) }, promptVersion: { findMany: vi.fn(async () => [prompt]) },
    brand: empty(), service: empty(), persona: empty(), personaRule: empty(), catalogRule: empty(), knowledgeBase: empty(), objection: empty(), clientMemory: empty(), response: empty(), channel: empty(),
  };
  return { db: db as unknown as PrismaClient, mock: db, product, client, prompt };
}

describe("versionado de reglas y contenido por cliente", () => {
  it("detecta modificaciones de prompt, política y stock aunque se edite la misma versión", async () => {
    const f = fixture(); const original = await loadCMVersion(f.db, "client");
    f.prompt.systemPrompt = "No inventar garantía";
    const promptChange = await loadCMVersion(f.db, "client"); expect(promptChange).not.toBe(original);
    f.product.stockStatus = "Sin stock";
    const productChange = await loadCMVersion(f.db, "client"); expect(productChange).not.toBe(promptChange);
    f.client.responsePolicy.tone = "formal";
    expect(await loadCMVersion(f.db, "client")).not.toBe(productChange);
  });
  it("no invalida respuestas al actualizar solo la fecha de sincronización", async () => {
    const f = fixture(); const original = await loadCMVersion(f.db, "client");
    f.product.updatedAt = new Date(); f.product.sourceSnapshotAt = new Date(); f.prompt.updatedAt = new Date();
    expect(await loadCMVersion(f.db, "client")).toBe(original);
  });
  it("consulta catálogo, marca y aprendizaje solamente del cliente solicitado", async () => {
    const f = fixture(); await loadCMVersion(f.db, "client");
    expect(f.mock.brand.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client" } }));
    expect(f.mock.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { brand: { clientId: "client" } } }));
    expect(f.mock.clientMemory.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client", active: true } }));
    const selection = f.mock.client.findUniqueOrThrow.mock.calls[0] as unknown[];
    expect(selection[0]).toMatchObject({ select: { responsePolicy: true } });
    expect(JSON.stringify(selection)).not.toContain("ApiKey");
  });
});
