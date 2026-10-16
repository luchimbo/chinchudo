import { describe, it, expect, vi } from "vitest";
import { taskJob, preparationLabel } from "./blog-tasks";
import { newPreparation, setPreparationPhase, failPreparation, recoverPreparations } from "../../scripts/blog-preparation.mjs";

const row = { id: "s", status: "PLANNED", lastError: "", errorCode: "", needsDeploy: false, updatedAt: new Date("2026-10-14T10:00:00Z"), scheduledDate: new Date("2026-11-01"), preparation: null as unknown, requiresApproval: false, landingId: null as string | null, plannedTitle: "", landing: null as any };
describe("tareas del blog", () => {
  it("un registro antiguo se muestra en espera sin inventar actividad", () => {
    expect(taskJob(row, "")).toMatchObject({ phase: "WAITING", operation: "generation", day: "2026-11-01", url: null });
    expect(preparationLabel(null)).toBe("En espera");
  });
  it.each([["GENERATING", "Generando"], ["REVIEWING", "Revisando calidad"]])("proyecta la etapa real %s", (phase, label) => {
    expect(taskJob({ ...row, preparation: { phase } }, "").phase).toBe(phase);
    expect(preparationLabel({ phase })).toBe(label);
  });
  it("calidad bloqueada nunca se presenta como preparado ni entrega URL pública", () => {
    expect(taskJob({ ...row, status: "READY", landingId: "a", requiresApproval: true, lastError: "Falta fuente", errorCode: "QUALITY_BLOCKED", preparation: { phase: "FAILED" } }, "https://blog.test")).toMatchObject({ status: "FAILED", operation: "generation", issue: { action: "edit" }, url: null });
  });
  it("conserva la aprobación del análisis comercial", () => {
    expect(taskJob({ ...row, status: "READY", landingId: "a", requiresApproval: true }, "")).toMatchObject({ status: "READY", requiresApproval: true });
  });
  it("una actualización sin verificación sigue publicando; una rechazada ofrece corrección", () => {
    expect(taskJob({ ...row, status: "PUBLISHED", needsDeploy: true }, "")).toMatchObject({ status: "PUBLISHING", operation: "publication", url: null });
    expect(taskJob({ ...row, status: "PUBLISHED", lastError: "Falta fuente", errorCode: "QUALITY_BLOCKED", landingId: "a" }, "")).toMatchObject({ status: "FAILED", issue: { action: "edit" }, url: null });
  });
  it("solo enlaza una publicación verificada", () => {
    expect(taskJob({ ...row, status: "PUBLISHED", landingId: "a", landing: { titulo: "Título", slug: "articulo", contentCluster: { slug: "guias" } } }, "https://blog.test").url).toBe("https://blog.test/guias/guias/articulo/");
  });
  it("los errores antiguos conservan un acceso al detalle y no inventan reintentos", () => {
    expect(taskJob({ ...row, status: "FAILED", lastError: "Error antiguo" }, "")).toMatchObject({ issue: { action: "detail", label: "Ver detalle" } });
  });
});

describe("intentos de preparación", () => {
  it("los cambios de etapa y fallos solo afectan al intento activo sin artículo", async () => {
    const metadata = newPreparation(new Date("2026-10-14T10:00:00Z"), 240_000);
    const update = vi.fn(async ({ where }: any) => ({ count: where.preparation.equals === "new-attempt" ? 1 : 0 }));
    const db = { blogPublication: { updateMany: update } } as any;
    expect((await setPreparationPhase(db, "s", "c", metadata, "REVIEWING"))?.count).toBe(0);
    expect((await failPreparation(db, "s", "c", metadata, "Error"))?.count).toBe(0);
    expect(update.mock.calls[0][0].where).toMatchObject({ clientId: "c", status: "PLANNED", landingId: null, preparation: { path: ["attemptId"], equals: metadata.attemptId } });
    expect(metadata.deadlineAt).toBe("2026-10-14T10:05:00.000Z");
  });
  it("recupera solo intentos vencidos con fecha válida", async () => {
    const now = new Date("2026-10-14T10:10:00Z");
    const stale = newPreparation(new Date("2026-10-14T10:00:00Z"));
    const db = { blogPublication: { findMany: vi.fn(async () => [{ id: "old", preparation: stale }, { id: "active", preparation: newPreparation(now) }, { id: "legacy", preparation: null }, { id: "corrupt", preparation: { attemptId: "bad", deadlineAt: "bad" } }]), updateMany: vi.fn(async () => ({ count: 1 })) } } as any;
    await recoverPreparations(db, "c", now);
    expect(db.blogPublication.updateMany).toHaveBeenCalledTimes(2);
    expect(db.blogPublication.updateMany.mock.calls.every(([call]: any[]) => call.where.id === "old")).toBe(true);
    expect(db.blogPublication.updateMany.mock.calls[1][0].data.errorCode).toBe("GENERATION_INTERRUPTED");
  });
});
