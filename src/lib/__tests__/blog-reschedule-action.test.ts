import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSlot: vi.fn(), findLanding: vi.fn(), assertAccess: vi.fn(), inspect: vi.fn(),
  findDestination: vi.fn(), deleteDestination: vi.fn(), updateSlot: vi.fn(), updateLanding: vi.fn(),
  transaction: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ assertClientAccess: mocks.assertAccess }));
vi.mock("@/lib/blog-evidence", () => ({ inspectBlogArticle: mocks.inspect }));
vi.mock("@/lib/db", () => ({ prisma: {
  blogPublication: { findUnique: mocks.findSlot },
  landing: { findUniqueOrThrow: mocks.findLanding },
  $transaction: mocks.transaction,
} }));

import { rescheduleBlogArticle } from "@/app/(app)/(creador)/blog/calendario/actions";
import { dateOnly } from "@/lib/blog-calendar";
import { editorialIntentForDate } from "@/lib/blog-quality.mjs";

const updatedAt = new Date("2026-10-09T12:00:00Z");
const slot = {
  id: "slot-1", clientId: "client-1", landingId: "article-1", status: "READY",
  scheduledDate: dateOnly("2026-10-10"), updatedAt, analysisRunId: null, requiresApproval: false,
  client: { slug: "pcmidi", responsePolicy: {} },
};
const content = { editorial_intent: editorialIntentForDate("2026-10-10"), h1: "Artículo original" };
const landing = { id: "article-1", updatedAt, htmlContent: JSON.stringify(content) };
const initialState = { error: null };
function form(target = "2026-10-12") {
  const data = new FormData();
  data.set("id", slot.id);
  data.set("scheduledDate", target);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T15:00:00Z"));
  mocks.findSlot.mockResolvedValue(slot);
  mocks.findLanding.mockResolvedValue(landing);
  mocks.inspect.mockResolvedValue({ publishable: true, checks: [] });
  mocks.findDestination.mockResolvedValue([]);
  mocks.deleteDestination.mockResolvedValue({ count: 1 });
  mocks.updateSlot.mockResolvedValue({ count: 1 });
  mocks.redirect.mockImplementation((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); });
  mocks.transaction.mockImplementation(async callback => callback({
    blogPublication: { findMany: mocks.findDestination, deleteMany: mocks.deleteDestination, updateMany: mocks.updateSlot },
    landing: { update: mocks.updateLanding },
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("reprogramación desde el calendario", () => {
  it("usa el siguiente día compatible cuando el elegido es de otro tipo", async () => {
    await expect(rescheduleBlogArticle(initialState, form("2026-10-11"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-10-12") }) }));
    expect(mocks.redirect).toHaveBeenCalledWith("/blog/calendario?client=pcmidi&month=2026-10&rescheduled=slot-1&requestedDate=2026-10-11");
  });

  it.each(["", "2026-02-30", "11/10/2026", "2026-13-01"])("devuelve una fecha inválida como error recuperable: %s", async target => {
    expect((await rescheduleBlogArticle(initialState, form(target))).error).toContain("fecha válida");
    expect(mocks.findSlot).not.toHaveBeenCalled();
  });

  it("rechaza formularios incompletos sin romper la página", async () => {
    expect((await rescheduleBlogArticle(initialState, new FormData())).error).toContain("fecha válida");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["2026-10-08", "2026-10-09"])("rechaza destinos que no son futuros: %s", async target => {
    expect(await rescheduleBlogArticle(initialState, form(target))).toEqual({ error: "Elegí una fecha futura." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("respeta el día local del cliente al validar el destino", async () => {
    vi.setSystemTime(new Date("2026-10-10T01:00:00Z")); // En Argentina todavía es el 9.
    mocks.findSlot.mockResolvedValue({ ...slot, scheduledDate: dateOnly("2026-10-12") });
    await expect(rescheduleBlogArticle(initialState, form("2026-10-10"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalled();
  });

  it.each([
    { id: "occupied", landingId: "another-article", status: "READY" },
    { id: "occupied", landingId: null, status: "SKIPPED" },
    { id: "occupied", landingId: "being-generated", status: "PLANNED" },
    { id: "occupied", landingId: null, status: "FAILED" },
    { id: "occupied", landingId: "published", status: "PUBLISHED" },
  ])("salta el destino ocupado sin modificarlo: %j", async occupied => {
    mocks.findDestination.mockResolvedValue([{ ...occupied, scheduledDate: dateOnly("2026-10-12"), updatedAt }]);
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.deleteDestination).not.toHaveBeenCalled();
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-10-14") }) }));
    expect(mocks.findDestination).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: slot.clientId, id: { not: slot.id }, scheduledDate: { gte: dateOnly("2026-10-12") } } }));
  });

  it("mueve a una reserva vacía, conserva el contenido y abre el mes de destino", async () => {
    mocks.findDestination.mockResolvedValue([{ id: "empty", landingId: null, status: "PLANNED", scheduledDate: dateOnly("2026-11-01"), updatedAt }]);
    await expect(rescheduleBlogArticle(initialState, form("2026-11-01"))).rejects.toThrow("NEXT_REDIRECT:/blog/calendario?client=pcmidi&month=2026-11");
    expect(mocks.deleteDestination).toHaveBeenCalledWith({ where: { id: "empty", landingId: null, status: "PLANNED", updatedAt } });
    expect(mocks.updateSlot).toHaveBeenCalledWith({
      where: { id: slot.id, updatedAt, status: "READY", landingId: landing.id, landing: { updatedAt } },
      data: { scheduledDate: dateOnly("2026-11-01"), status: "READY", attempts: 0, lastError: "" },
    });
    expect(mocks.updateLanding).toHaveBeenCalledWith({ where: { id: landing.id }, data: { status: "DRAFT", publishedAt: null } });
    expect(mocks.revalidatePath.mock.calls.flat()).toEqual(expect.arrayContaining(["/blog", "/blog/calendario", "/blog/articulos/article-1"]));
  });

  it.each(["SKIPPED", "FAILED"])("recupera un artículo vencido en estado %s", async status => {
    mocks.findSlot.mockResolvedValue({ ...slot, scheduledDate: dateOnly("2026-10-08"), status });
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalled();
  });

  it("vuelve a exigir aprobación para artículos del análisis del negocio", async () => {
    mocks.findSlot.mockResolvedValue({ ...slot, scheduledDate: dateOnly("2026-10-08"), analysisRunId: "analysis-1", requiresApproval: true });
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ requiresApproval: true, approvedAt: null }) }));
  });

  it("mantiene los problemas de calidad para revisión después de mover", async () => {
    mocks.inspect.mockResolvedValue({ publishable: false, checks: [{ level: "error", message: "Faltan fuentes" }] });
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", attempts: 3, lastError: "Faltan fuentes" }) }));
  });

  it.each(["PUBLISHING", "PUBLISHED"])("rechaza artículos en estado %s sin escribir", async status => {
    mocks.findSlot.mockResolvedValue({ ...slot, status });
    expect((await rescheduleBlogArticle(initialState, form())).error).toContain("publicación");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rechaza cambios concurrentes antes de modificar el artículo", async () => {
    mocks.updateSlot.mockResolvedValue({ count: 0 });
    expect((await rescheduleBlogArticle(initialState, form())).error).toContain("cambió");
    expect(mocks.updateLanding).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("busca nuevamente si otro proceso ocupa la fecha durante el guardado", async () => {
    mocks.findDestination.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "race", landingId: "new-article", status: "READY", scheduledDate: dateOnly("2026-10-12"), updatedAt }]);
    mocks.updateSlot.mockRejectedValueOnce({ code: "P2002" });
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.updateSlot).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-10-14") }) }));
  });

  it("no borra una reserva si otro proceso ya le asignó un artículo", async () => {
    const occupied = { id: "race", landingId: null, status: "PLANNED", scheduledDate: dateOnly("2026-10-12"), updatedAt };
    mocks.findDestination.mockResolvedValueOnce([occupied]).mockResolvedValueOnce([{ ...occupied, landingId: "new-article" }]);
    mocks.deleteDestination.mockResolvedValueOnce({ count: 0 });
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.updateSlot).toHaveBeenCalledTimes(1);
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-10-14") }) }));
  });

  it("informa conflictos repetidos sin romper la página", async () => {
    mocks.transaction.mockRejectedValue({ code: "P2034" });
    expect((await rescheduleBlogArticle(initialState, form())).error).toContain("próxima disponible");
    expect(mocks.transaction).toHaveBeenCalledTimes(3);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("salta varios días ocupados y reutiliza el primer hueco compatible", async () => {
    mocks.findDestination.mockResolvedValue([
      { id: "first", landingId: "existing-1", status: "READY", scheduledDate: dateOnly("2026-10-12"), updatedAt },
      { id: "second", landingId: "existing-2", status: "READY", scheduledDate: dateOnly("2026-10-14"), updatedAt },
      { id: "empty", landingId: null, status: "PLANNED", scheduledDate: dateOnly("2026-10-16"), updatedAt },
      { id: "later", landingId: "existing-3", status: "READY", scheduledDate: dateOnly("2026-10-18"), updatedAt },
    ]);
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-10-16") }) }));
    expect(mocks.deleteDestination).toHaveBeenCalledTimes(1);
    expect(mocks.deleteDestination).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "empty" }) }));
  });

  it("abre el mes de la fecha asignada cuando la búsqueda cruza de mes", async () => {
    mocks.findDestination.mockResolvedValue([{ id: "occupied", landingId: "existing", status: "READY", scheduledDate: dateOnly("2026-10-30"), updatedAt }]);
    await expect(rescheduleBlogArticle(initialState, form("2026-10-30"))).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scheduledDate: dateOnly("2026-11-01") }) }));
    expect(mocks.redirect).toHaveBeenCalledWith("/blog/calendario?client=pcmidi&month=2026-11&rescheduled=slot-1&requestedDate=2026-10-30");
  });

  it("conserva la fecha actual si es el primer hueco al intentar adelantar", async () => {
    mocks.findSlot.mockResolvedValue({ ...slot, scheduledDate: dateOnly("2026-10-16") });
    mocks.findDestination.mockResolvedValue([
      { id: "first", landingId: "existing-1", status: "READY", scheduledDate: dateOnly("2026-10-12"), updatedAt },
      { id: "second", landingId: "existing-2", status: "READY", scheduledDate: dateOnly("2026-10-14"), updatedAt },
    ]);
    await expect(rescheduleBlogArticle(initialState, form())).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.updateSlot).not.toHaveBeenCalled();
    expect(mocks.updateLanding).not.toHaveBeenCalled();
  });

  it("devuelve un error recuperable si falta el tipo editorial", async () => {
    mocks.findLanding.mockResolvedValue({ ...landing, htmlContent: JSON.stringify({ h1: "Sin tipo" }) });
    expect((await rescheduleBlogArticle(initialState, form())).error).toContain("tipo editorial válido");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("comprueba el acceso antes de leer el contenido o escribir", async () => {
    mocks.assertAccess.mockRejectedValue(new Error("No tenés acceso a este cliente."));
    expect(await rescheduleBlogArticle(initialState, form())).toEqual({ error: "No tenés acceso a este cliente." });
    expect(mocks.findLanding).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["{roto", "null", "[]"])("informa contenido inválido sin romper la página: %s", async htmlContent => {
    mocks.findLanding.mockResolvedValue({ ...landing, htmlContent });
    expect((await rescheduleBlogArticle(initialState, form())).error).toContain("estructura válida");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("conserva un error de infraestructura en el servidor y permite reintentar", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.findSlot.mockRejectedValue(new Error("Database connection failed"));
    const result = await rescheduleBlogArticle(initialState, form());
    expect(result.error).toContain("Reintentá");
    expect(result.error).not.toContain("Database");
    expect(log).toHaveBeenCalled();
  });

  it("no escribe ni redirige si se elige la misma fecha", async () => {
    expect(await rescheduleBlogArticle(initialState, form("2026-10-10"))).toEqual(initialState);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
