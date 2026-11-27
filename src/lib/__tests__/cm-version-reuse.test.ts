import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadCMVersion } from "../cm-version";

function fakeDb() {
  const products: { id: string; name: string }[] = [{ id: "p1", name: "Keystep" }];
  const empty = vi.fn(async () => []);
  const db = {
    client: { findUniqueOrThrow: vi.fn(async () => ({ id: "c", slug: "pcmidi" })) },
    promptVersion: { findMany: empty }, brand: { findMany: empty }, service: { findMany: empty }, persona: { findMany: empty },
    personaRule: { findMany: empty }, catalogRule: { findMany: empty }, knowledgeBase: { findMany: empty }, objection: { findMany: empty },
    channel: { findMany: empty }, product: { findMany: vi.fn(async () => products) },
  };
  return { db: db as unknown as PrismaClient, products, loads: db.product.findMany };
}

describe("versión del cliente reutilizada por un minuto", () => {
  it("reutiliza la versión reciente y la recalcula cuando se pide sin reutilizar", async () => {
    const { db, products, loads } = fakeDb();
    const first = await loadCMVersion(db, "client-a", { maxAgeMs: 60_000 });
    expect(await loadCMVersion(db, "client-a", { maxAgeMs: 60_000 })).toBe(first);
    expect(loads).toHaveBeenCalledTimes(1);

    products.push({ id: "p2", name: "Nuevo" });
    expect(await loadCMVersion(db, "client-a", { maxAgeMs: 60_000 })).toBe(first); // still within the window
    const fresh = await loadCMVersion(db, "client-a");
    expect(fresh).not.toBe(first);
    expect(await loadCMVersion(db, "client-a", { maxAgeMs: 60_000 })).toBe(fresh); // the recomputed value is reused
    expect(loads).toHaveBeenCalledTimes(2);
  });

  it("cada cliente tiene su propia versión", async () => {
    const { db, loads } = fakeDb();
    await loadCMVersion(db, "client-b", { maxAgeMs: 60_000 });
    await loadCMVersion(db, "client-c", { maxAgeMs: 60_000 });
    expect(loads).toHaveBeenCalledTimes(2);
  });
});
