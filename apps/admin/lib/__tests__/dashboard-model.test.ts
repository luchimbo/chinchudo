import { describe, expect, it } from "vitest";
import { argentinaDayStart, clientAttention, latestDate, supportState } from "../dashboard-model";

describe("señales administrativas", () => {
  it("usa el día de Argentina aunque UTC ya haya cambiado de día", () => {
    expect(argentinaDayStart(new Date("2026-10-06T01:30:00Z")).toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(argentinaDayStart(new Date("2026-10-06T03:00:00Z")).toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });
  it("distingue un código todavía no usado de una sesión activa", () => {
    const now = new Date("2026-10-05T15:00:00Z");
    const session = { revokedAt: null, endedAt: null, exchangedAt: null, expiresAt: new Date("2026-10-05T16:00:00Z") };
    expect(supportState(session, now)).toMatchObject({ label: "Pendiente de ingreso", revocable: true });
    expect(supportState({ ...session, exchangedAt: now }, now).label).toBe("Activa");
    expect(supportState({ ...session, expiresAt: now }, now)).toMatchObject({ label: "Vencida", revocable: false });
    expect(supportState({ ...session, revokedAt: now }, now).revocable).toBe(false);
    expect(supportState({ ...session, endedAt: now }, now).revocable).toBe(false);
  });
  const healthy = { description: "Negocio configurado", userCount: 3, onboarding: null, sourceErrors: 0, draftFailures: 0, staleDrafts: 0, blogFailures: 0, staleAnalysis: false };
  it("no supone que un cliente anterior al alta autoservicio esté incompleto", () => {
    expect(clientAttention(healthy)).toEqual([]);
    expect(latestDate([null, undefined])).toBeNull();
  });
  it("detecta errores, tareas sin plazo y configuración pendiente", () => {
    const alerts = clientAttention({ ...healthy, description: " ", userCount: 0, onboarding: { status: "IN_REVIEW", analysisError: "Falló" }, sourceErrors: 2, draftFailures: 1, staleDrafts: 1, blogFailures: 2, catalogStatus: "PENDING_DEPLOY", businessStatus: "PARTIAL", staleAnalysis: true });
    expect(alerts).toHaveLength(11);
    expect(alerts).toContain("2 sitios o búsquedas con errores o bloqueos");
  });
});
