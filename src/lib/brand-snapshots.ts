import { Prisma, PrismaClient } from "@prisma/client";
import { operationalOpportunityWhere } from "./opportunity-channels";

export const SNAPSHOT_CLIENT_SLUGS = ["jurispedia", "prestige-running"] as const;
export const SNAPSHOT_MILESTONES = ["D0", "D30", "D60", "D90", "D180", "D365"] as const;
const MILESTONE_DAYS: Record<(typeof SNAPSHOT_MILESTONES)[number], number> = { D0: 0, D30: 30, D60: 60, D90: 90, D180: 180, D365: 365 };

export type SnapshotMetrics = {
  configuration: Record<string, number>;
  funnel: Record<string, number>;
  landings: Record<string, number>;
  tracking: Record<string, number>;
};

/** Argentina usa UTC-3 sin horario estacional; cada hito siempre se ancla a las 12:00 ART. */
export function argentinaNoon(date = new Date()) {
  const argentinaClock = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(argentinaClock.getUTCFullYear(), argentinaClock.getUTCMonth(), argentinaClock.getUTCDate(), 15, 0, 0, 0));
}

export function scheduleForMilestone(baselineAt: Date, milestone: keyof typeof MILESTONE_DAYS) {
  const scheduled = new Date(baselineAt);
  scheduled.setUTCDate(scheduled.getUTCDate() + MILESTONE_DAYS[milestone]);
  return scheduled;
}

export function metricDelta(metrics: SnapshotMetrics, baseline: SnapshotMetrics): SnapshotMetrics {
  const subtract = (values: Record<string, number>, base: Record<string, number>) =>
    Object.fromEntries(Object.keys({ ...values, ...base }).map((key) => [key, (values[key] ?? 0) - (base[key] ?? 0)]));
  return {
    configuration: subtract(metrics.configuration, baseline.configuration),
    funnel: subtract(metrics.funnel, baseline.funnel),
    landings: subtract(metrics.landings, baseline.landings),
    tracking: subtract(metrics.tracking, baseline.tracking),
  };
}

export async function collectSnapshotMetrics(prisma: PrismaClient, clientId: string): Promise<SnapshotMetrics> {
  const [brands, personas, products, knowledge, objections, activeSources, inactiveSources, opportunities, responses, approvedResponses, publishedResponses, landings, leads, events] = await Promise.all([
    prisma.brand.count({ where: { clientId } }), prisma.persona.count({ where: { clientId } }),
    prisma.product.count({ where: { brand: { clientId } } }), prisma.knowledgeBase.count({ where: { clientId } }),
    prisma.objection.count({ where: { clientId } }), prisma.monitoredSource.count({ where: { clientId, channel: "youtube", active: true } }),
    prisma.monitoredSource.count({ where: { clientId, channel: "youtube", active: false } }),
    prisma.opportunity.groupBy({ by: ["status"], where: { clientId, ...operationalOpportunityWhere() }, _count: { id: true } }),
    prisma.response.count({ where: { opportunity: { clientId, ...operationalOpportunityWhere() } } }),
    prisma.response.count({ where: { opportunity: { clientId, ...operationalOpportunityWhere() }, approvedBy: { not: "" } } }),
    prisma.publishingLog.count({ where: { opportunity: { clientId, ...operationalOpportunityWhere() } } }),
    prisma.landing.groupBy({ by: ["status"], where: { clientId }, _count: { id: true } }),
    prisma.lead.count({ where: { clientId } }),
    prisma.trackingEvent.groupBy({ by: ["eventType"], where: { clientId }, _count: { id: true } }),
  ]);
  const statuses = Object.fromEntries(opportunities.map((row) => [row.status, row._count.id]));
  const landingStatuses = Object.fromEntries(landings.map((row) => [row.status, row._count.id]));
  const eventTypes = Object.fromEntries(events.map((row) => [row.eventType, row._count.id]));
  return {
    configuration: { brands, personas, products, knowledge, objections, activeSources, inactiveSources },
    funnel: { opportunities: opportunities.reduce((sum, row) => sum + row._count.id, 0), responses, approvedResponses, publishedResponses, new: statuses.NEW ?? 0, needsReview: statuses.NEEDS_REVIEW ?? 0, drafted: statuses.DRAFTED ?? 0, approved: statuses.APPROVED ?? 0, published: statuses.PUBLISHED ?? 0, followUp: statuses.FOLLOW_UP ?? 0, converted: statuses.CONVERTED ?? 0, discarded: statuses.DISCARDED ?? 0 },
    landings: { total: landings.reduce((sum, row) => sum + row._count.id, 0), draft: landingStatuses.DRAFT ?? 0, approved: landingStatuses.APPROVED ?? 0, preview: landingStatuses.PREVIEW_ONLINE ?? 0, published: landingStatuses.PUBLISHED ?? 0, archived: landingStatuses.ARCHIVED ?? 0, leads },
    tracking: { total: events.reduce((sum, row) => sum + row._count.id, 0), pageViews: eventTypes.page_view ?? 0, ctaClicks: eventTypes.cta_click ?? 0, formSubmits: eventTypes.form_submit ?? 0, searchesStarted: eventTypes.jurispedia_search_started ?? 0 },
  };
}

export function asSnapshotMetrics(value: Prisma.JsonValue): SnapshotMetrics {
  return value as unknown as SnapshotMetrics;
}
