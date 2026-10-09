import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), assertClientAccess: vi.fn(), relayFetch: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { blogPublication: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: mocks.assertClientAccess }));
vi.mock("@/lib/relay-client", () => ({ relayFetch: mocks.relayFetch }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { publishCalendarArticle } from "@/app/(app)/(creador)/blog/calendario/actions";
import { prisma } from "@/lib/db";

const slot = { id: "slot", clientId: "cliente", updatedAt: new Date("2026-10-09T12:00:00Z"), status: "READY", requiresApproval: false, landing: { id: "articulo" } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findUnique.mockResolvedValue({ ...slot });
  mocks.relayFetch.mockResolvedValue({ status: 202, json: async () => ({ accepted: true }) });
});

describe("publicar desde el calendario", () => {
  it("verifica acceso, envía el cliente y la versión al relay, y refresca las páginas", async () => {
    expect(await publishCalendarArticle("slot")).toEqual({ ok: true });
    expect(mocks.assertClientAccess).toHaveBeenCalledWith(prisma, "cliente");
    const [path, request] = mocks.relayFetch.mock.calls[0];
    expect(path).toBe("/blog/publish");
    expect(JSON.parse(request.body)).toEqual({ id: "slot", clientId: "cliente", expectedUpdatedAt: slot.updatedAt.toISOString() });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/blog/calendario");
  });

  it("no envía pedidos sin autorización", async () => {
    mocks.assertClientAccess.mockRejectedValue(new Error("Sin acceso"));
    expect(await publishCalendarArticle("slot")).toMatchObject({ ok: false });
    expect(mocks.relayFetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...slot, requiresApproval: true },
    { ...slot, status: "PUBLISHED" },
    { ...slot, status: "PUBLISHING" },
    { ...slot, landing: null },
    null,
  ])("no publica borradores sin aprobar, artículos ocupados ni faltantes", async (value) => {
    mocks.findUnique.mockResolvedValue(value);
    expect(await publishCalendarArticle("slot")).toMatchObject({ ok: false });
    expect(mocks.relayFetch).not.toHaveBeenCalled();
  });

  it("muestra el error del relay sin informar éxito", async () => {
    mocks.relayFetch.mockResolvedValue({ status: 409, json: async () => ({ error: "El blog está ocupado. Reintentá." }) });
    expect(await publishCalendarArticle("slot")).toEqual({ ok: false, error: "El blog está ocupado. Reintentá." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un relay desconectado permite reintentar", async () => {
    mocks.relayFetch.mockRejectedValue(new Error("Timeout"));
    expect(await publishCalendarArticle("slot")).toMatchObject({ ok: false, error: expect.stringContaining("reintentá") });
  });
});
