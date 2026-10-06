import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { loadDashboard } from "../dashboard-data";

export function fixtureDb() {
  const client = (id: string) => ({ id, name: `Cliente ${id}`, slug: id, active: true, description: "Negocio configurado", storeUrl: "", blogBaseUrl: "", autoPublish: false, autoApprove: false, dailyOpportunityTarget: 50, dailyDraftTarget: 50, onboarding: null,
    _count: { users: 2, brands: 1, personas: 5, opportunities: 1800, leads: 8, landings: 32, trends: 12, videoScripts: 4, aiPresenceResults: 6, monitoredSources: 2 },
    catalogSyncRuns: [], businessAnalysisRuns: [], opportunities: [], landings: [], leads: [], videoScripts: [], trends: [], aiPresenceResults: [],
  });
  return {
    client: { findMany: vi.fn().mockResolvedValue([client("a"), client("b")]) },
    opportunity: { groupBy: vi.fn().mockResolvedValueOnce([{ clientId: "a", _count: { _all: 9 } }]).mockResolvedValueOnce([{ clientId: "b", _count: { _all: 7 } }]) },
    draftJob: { groupBy: vi.fn().mockResolvedValueOnce([{ clientId: "a", status: "FAILED", _count: { _all: 3 }, _max: { updatedAt: new Date("2026-10-05T13:00:00Z") } }, { clientId: "b", status: "QUEUED", _count: { _all: 5 }, _max: { updatedAt: null } }]).mockResolvedValueOnce([]) },
    monitoredSource: { groupBy: vi.fn().mockResolvedValueOnce([{ clientId: "a", _count: { _all: 2 } }]).mockResolvedValueOnce([{ clientId: "a", _max: { lastRunAt: new Date("2026-10-05T15:00:00Z") } }]) },
    blogPublication: { groupBy: vi.fn().mockResolvedValueOnce([{ clientId: "a", status: "READY", needsDeploy: false, _count: { _all: 2 }, _max: { updatedAt: null } }, { clientId: "a", status: "READY", needsDeploy: true, _count: { _all: 3 }, _max: { updatedAt: new Date("2026-10-05T14:00:00Z") } }]).mockResolvedValueOnce([{ clientId: "b", _count: { _all: 4 } }]) },
    user: { count: vi.fn().mockResolvedValue(245) }, supportSession: { count: vi.fn().mockResolvedValue(50) },
    adminAuditEvent: { count: vi.fn().mockResolvedValue(900) }, issueReport: { count: vi.fn().mockResolvedValue(75) },
  };
}

describe("resumen de plataforma", () => {
  it("cuenta totales sin depender de los límites de las listas y mantiene las señales de cada cliente", async () => {
    const db = fixtureDb();
    const data = await loadDashboard(db as unknown as PrismaClient, new Date("2026-10-05T16:00:00Z"));
    expect(data.totals).toEqual({ users: 245, activeSupport: 50, audits: 900, openReports: 75 });
    expect(data.clients[0]).toMatchObject({ todayOpportunities: 9, sourceErrors: 2, draft: { failed: 3, queued: 0 } });
    expect(data.clients[1]).toMatchObject({ todayOpportunities: 0, sourceErrors: 0, draft: { queued: 5, failed: 0 } });
    expect(data.clients[0]).not.toHaveProperty("pendingOpportunities");
    expect(data.clients[0]).not.toHaveProperty("blogApproval");
    expect(data.clients[0]).not.toHaveProperty("alerts");
    expect(db.opportunity.groupBy).toHaveBeenCalledTimes(1);
    expect(db.opportunity.groupBy.mock.calls[0][0].where).not.toHaveProperty("status");
    expect(db.blogPublication.groupBy).toHaveBeenCalledTimes(1);
    expect(db.monitoredSource.groupBy.mock.calls[0][0].where).toEqual({ active: true, lastError: { not: "" } });
    expect(data.clients[0].lastActivityAt?.toISOString()).toBe("2026-10-05T15:00:00.000Z");
    expect(data.clients[0].blog).toMatchObject({ ready: 5, pendingDeploy: 3 });
    expect(db.supportSession.count).toHaveBeenCalledWith({ where: { revokedAt: null, endedAt: null, exchangedAt: { not: null }, expiresAt: { gt: data.now } } });
    expect(db.client.findMany.mock.calls[0][0].select).not.toHaveProperty("openrouterApiKey");
    expect(db.client.findMany.mock.calls[0][0].select).not.toHaveProperty("smtpPass");
  });
});
