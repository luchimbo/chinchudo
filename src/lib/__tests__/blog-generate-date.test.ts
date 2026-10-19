import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), client: vi.fn(), create: vi.fn(), slot: vi.fn(), reserved: vi.fn(), update: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { client: { findUniqueOrThrow: mocks.client }, blogPublication: { createMany: mocks.create, findUniqueOrThrow: mocks.slot, findUnique: mocks.reserved, updateMany: mocks.update } } }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: mocks.access }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { generateBlogDate } from "@/app/(app)/(creador)/blog/calendario/actions";

function request(day: string, language?: string, brief?: string) {
  const data = new FormData();
  data.set("clientId", "pcmidi-id"); data.set("scheduledDate", day);
  if (language) data.set("language", language);
  if (brief !== undefined) data.set("brief", brief);
  return generateBlogDate({ error: null, queued: false }, data);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T01:00:00Z")); // Todavía 13 en Argentina.
  mocks.client.mockResolvedValue({ slug: "pcmidi", responsePolicy: "" });
  mocks.create.mockResolvedValue({ count: 1 });
  mocks.slot.mockResolvedValue({ id: "reserved-day" });
});
afterEach(() => vi.useRealTimers());

describe("generar un artículo para un día vacío", () => {
  it("reserva mañana según Argentina, con fecha exacta y protección de duplicados", async () => {
    expect(await request("2026-10-14")).toEqual({ error: null, queued: true, id: "reserved-day", client: "pcmidi" });
    expect(mocks.access).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({ data: [{ clientId: "pcmidi-id", scheduledDate: new Date("2026-10-14T00:00:00Z"), preparation: { language: "es", comparison: false } }], skipDuplicates: true });
  });
  it("conserva el idioma elegido para cualquier cliente con calendario", async () => {
    mocks.client.mockResolvedValue({ slug: "another-brand", responsePolicy: { blog: { calendar: true, language: "en" } } });
    expect(await request("2026-10-22", "de")).toMatchObject({ queued: true, client: "another-brand" });
    expect(mocks.create.mock.calls[0][0].data[0].preparation).toEqual({ language: "de", comparison: false });
  });
  it("reserva comparativas solo en dias para elegir y respeta la casilla", async () => {
    mocks.client.mockResolvedValue({ slug: "another-brand", responsePolicy: { blog: { calendar: true, comparisons: true } } });
    await request("2026-10-21");
    expect(mocks.create.mock.calls[0][0].data[0].preparation).toEqual({ language: "es", comparison: true });
    await request("2026-10-22");
    expect(mocks.create.mock.calls[1][0].data[0].preparation).toEqual({ language: "es", comparison: false });
    const data = new FormData();
    data.set("clientId", "pcmidi-id"); data.set("scheduledDate", "2026-10-23"); data.set("language", "es"); data.set("comparisonOffered", "1");
    await generateBlogDate({ error: null, queued: false }, data);
    expect(mocks.create.mock.calls[2][0].data[0].preparation).toEqual({ language: "es", comparison: false });
  });
  it("usa el idioma configurado y rechaza idiomas no soportados", async () => {
    mocks.client.mockResolvedValue({ slug: "another-brand", responsePolicy: { blog: { calendar: true, language: "en" } } });
    expect(await request("2026-10-22", "fr")).toMatchObject({ queued: false });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await request("2026-10-22")).toMatchObject({ queued: true });
    expect(mocks.create.mock.calls[0][0].data[0].preparation.language).toBe("en");
  });
  it("admite días fuera del horizonte de 14 días", async () => {
    expect(await request("2027-01-04")).toMatchObject({ queued: true });
  });
  it.each(["2026-10-13", "2026-10-12", "2026-02-30", "invalid"])("rechaza hoy, pasado y fechas inválidas: %s", async day => {
    expect(await request(day)).toMatchObject({ queued: false, error: expect.any(String) });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("no sobrescribe una fecha ocupada ni en pedidos simultáneos", async () => {
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const results = await Promise.all([request("2026-10-22"), request("2026-10-22")]);
    expect(results.filter(r => r.queued)).toHaveLength(1);
    expect(results[1].error).toContain("ya tiene");
  });
  it("rechaza otro cliente", async () => {
    mocks.client.mockResolvedValue({ slug: "prestige-running", responsePolicy: "" });
    expect(await request("2026-10-22")).toMatchObject({ queued: false });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("no escribe sin acceso", async () => {
    mocks.access.mockRejectedValue(new Error("Sin acceso"));
    expect(await request("2026-10-22")).toMatchObject({ queued: false });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("permite reintentar errores de reserva sin informar éxito", async () => {
    mocks.create.mockRejectedValue(new Error("DB offline"));
    expect(await request("2026-10-22")).toMatchObject({ queued: false, error: expect.any(String) });
  });
  it("guarda la consigna normalizada y sin comparativa automática", async () => {
    mocks.client.mockResolvedValue({ slug: "another-brand", responsePolicy: { blog: { calendar: true, comparisons: true } } });
    expect(await request("2026-10-21", "es", "  Cómo elegir\n auriculares   para mezclar ")).toMatchObject({ queued: true });
    expect(mocks.create.mock.calls[0][0].data[0].preparation).toEqual({ language: "es", comparison: false, brief: "Cómo elegir auriculares para mezclar" });
  });
  it("rechaza consignas demasiado largas sin reservar", async () => {
    expect(await request("2026-10-21", "es", "a".repeat(501))).toMatchObject({ queued: false, error: expect.stringContaining("500") });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("completa un día reservado automáticamente que todavía no empezó", async () => {
    const updatedAt = new Date("2026-10-13T12:00:00Z");
    mocks.create.mockResolvedValue({ count: 0 });
    mocks.reserved.mockResolvedValue({ id: "reserved-day", status: "PLANNED", landingId: null, analysisRunId: null, preparation: null, updatedAt });
    mocks.update.mockResolvedValue({ count: 1 });
    expect(await request("2026-10-22", "es", "Latencia para principiantes")).toEqual({ error: null, queued: true, id: "reserved-day", client: "pcmidi" });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "reserved-day", status: "PLANNED", landingId: null, updatedAt }, data: { preparation: { language: "es", comparison: false, brief: "Latencia para principiantes", phase: "WAITING" } } });
  });
  it.each([
    ["en preparación", { status: "PLANNED", landingId: null, preparation: { phase: "GENERATING", attemptId: "a1" } }],
    ["con artículo", { status: "READY", landingId: "landing-1", preparation: null }],
    ["del análisis comercial", { status: "PLANNED", landingId: null, analysisRunId: "run-1", preparation: null }],
  ])("no toca un día %s", async (_label, slot) => {
    mocks.create.mockResolvedValue({ count: 0 });
    mocks.reserved.mockResolvedValue({ id: "taken", analysisRunId: null, updatedAt: new Date(), ...slot });
    expect(await request("2026-10-22", "es", "Tema")).toMatchObject({ queued: false, error: expect.any(String) });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
