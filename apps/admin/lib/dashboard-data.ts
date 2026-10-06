import type { PrismaClient } from "@prisma/client";
import { argentinaDayStart, latestDate } from "./dashboard-model";

// Called only after requirePlatformAdmin. Explicit projections keep credentials,
// tokens and generated content out of the dashboard and its client components.
export async function loadDashboard(db: PrismaClient, now = new Date()) {
  const [clients, today, drafts, sourceErrors, sourceActivity, blogStatuses, totals] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" }, select: {
      id: true, name: true, slug: true, active: true, description: true, storeUrl: true, blogBaseUrl: true,
      autoPublish: true, autoApprove: true,
      onboarding: { select: { updatedAt: true } },
      _count: { select: { users: true, brands: true, personas: true, opportunities: true, leads: true, landings: true, trends: true, videoScripts: true, aiPresenceResults: true, monitoredSources: { where: { active: true } } } },
      catalogSyncRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, updatedAt: true } },
      businessAnalysisRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, updatedAt: true } },
      opportunities: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      landings: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      leads: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      videoScripts: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      trends: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      aiPresenceResults: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
    } }),
    db.opportunity.groupBy({ by: ["clientId"], where: { createdAt: { gte: argentinaDayStart(now) } }, _count: { _all: true } }),
    db.draftJob.groupBy({ by: ["clientId", "status"], _count: { _all: true }, _max: { updatedAt: true } }),
    db.monitoredSource.groupBy({ by: ["clientId"], where: { active: true, lastError: { not: "" } }, _count: { _all: true } }),
    db.monitoredSource.groupBy({ by: ["clientId"], where: { active: true }, _max: { lastRunAt: true } }),
    db.blogPublication.groupBy({ by: ["clientId", "status", "needsDeploy"], _count: { _all: true }, _max: { updatedAt: true } }),
    Promise.all([
      db.user.count(), db.supportSession.count({ where: { revokedAt: null, endedAt: null, exchangedAt: { not: null }, expiresAt: { gt: now } } }),
      db.adminAuditEvent.count(), db.issueReport.count({ where: { status: "OPEN" } }),
    ]),
  ]);
  const countMap = (rows: Array<{ clientId: string | null; _count: { _all: number } }>) => new Map(rows.map(row => [row.clientId, row._count._all]));
  const todayMap = countMap(today), errorMap = countMap(sourceErrors);
  const sourceMap = new Map(sourceActivity.map(row => [row.clientId, row._max.lastRunAt]));
  const draftMap = new Map<string, { queued: number; processing: number; failed: number; updatedAt: Date | null }>();
  const blogMap = new Map<string, { planned: number; ready: number; publishing: number; failed: number; pendingDeploy: number; updatedAt: Date | null }>();
  for (const row of blogStatuses) {
    const stats = blogMap.get(row.clientId) || { planned: 0, ready: 0, publishing: 0, failed: 0, pendingDeploy: 0, updatedAt: null };
    if (row.status === "PLANNED") stats.planned += row._count._all;
    if (row.status === "READY") stats.ready += row._count._all;
    if (row.status === "PUBLISHING") stats.publishing += row._count._all;
    if (row.status === "FAILED") stats.failed += row._count._all;
    if (row.needsDeploy) stats.pendingDeploy += row._count._all;
    stats.updatedAt = latestDate([stats.updatedAt, row._max.updatedAt]);
    blogMap.set(row.clientId, stats);
  }
  for (const row of drafts) {
    const stats = draftMap.get(row.clientId) || { queued: 0, processing: 0, failed: 0, updatedAt: null };
    if (row.status === "QUEUED") stats.queued = row._count._all;
    if (row.status === "PROCESSING") stats.processing = row._count._all;
    if (row.status === "FAILED") stats.failed = row._count._all;
    stats.updatedAt = latestDate([stats.updatedAt, row._max.updatedAt]);
    draftMap.set(row.clientId, stats);
  }
  return {
    now, totals: { users: totals[0], activeSupport: totals[1], audits: totals[2], openReports: totals[3] },
    clients: clients.map(client => {
      const draft = draftMap.get(client.id) || { queued: 0, processing: 0, failed: 0, updatedAt: null };
      const blog = blogMap.get(client.id) || { planned: 0, ready: 0, publishing: 0, failed: 0, pendingDeploy: 0, updatedAt: null };
      const catalog = client.catalogSyncRuns[0], business = client.businessAnalysisRuns[0];
      return { ...client, draft, blog, catalog, business, sourceErrors: errorMap.get(client.id) || 0, lastListenAt: sourceMap.get(client.id) || null,
        todayOpportunities: todayMap.get(client.id) || 0,
        lastActivityAt: latestDate([sourceMap.get(client.id), draft.updatedAt, blog.updatedAt, catalog?.updatedAt, business?.updatedAt, client.onboarding?.updatedAt,
          client.opportunities[0]?.updatedAt, client.landings[0]?.updatedAt, client.leads[0]?.createdAt, client.videoScripts[0]?.updatedAt,
          client.trends[0]?.createdAt, client.aiPresenceResults[0]?.createdAt]),
      };
    }),
  };
}
