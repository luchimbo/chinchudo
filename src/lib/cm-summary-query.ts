import { Prisma, type PrismaClient } from "@prisma/client";
import type { cmOpportunityView } from "./cm-opportunity-view";
import type { CoverageRow } from "./cm-coverage-view";
import { YOUTUBE_OPPORTUNITY_CHANNEL_NAME } from "./opportunity-channels";

const DAY_MS = 86_400_000;

export function cmQueueSort(value: string | undefined) {
  return value === "relevance" || value === "newest" || value === "oldest" ? value : "today";
}

export function cmQueueResponse(value: string | undefined) {
  return ["generated", "missing", "stale", "fresh", "review", "error"].includes(value ?? "") ? value! : "";
}

export function cmQueueCoverage(rows: CoverageRow[], response: string, pending = false) {
  return {
    ids: pending ? [] : rows.filter(row => row.status === response).map(row => row.id),
    readyIds: pending ? [] : rows.filter(row => row.status === "fresh" || row.status === "review").map(row => row.id),
  };
}

export function cmPriorityReasons(intent: string, createdAt: string, ready: boolean, now: Date) {
  const reasons: string[] = [];
  if (intent === "PURCHASE_QUESTION") reasons.push("Consulta de compra");
  if (intent === "PRICE_QUESTION") reasons.push("Preguntó por precio");
  const hours = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 3_600_000));
  const days = Math.floor(hours / 24);
  if (days) reasons.push(days === 1 ? "Hace 1 día" : `Hace ${days} días`);
  if (ready) reasons.push("Respuesta lista para revisar");
  if (!reasons.length) reasons.push(hours < 1 ? "Hace menos de 1 hora" : hours === 1 ? "Hace 1 hora" : `Hace ${hours} horas`);
  return reasons;
}

type Summary = ReturnType<typeof cmOpportunityView>;
type QueueRow = { id: string; intent: string; ready: boolean; createdAt: string; item: Summary | null };
type QueueResult = { page: number; targetMissing: boolean; rows: QueueRow[] };

/** Select the queue page first, then hydrate only the cards it contains. */
export async function loadCMSummaries(db: PrismaClient, input: {
  clientId: string;
  brand: string;
  channel: string;
  response: string;
  ids: string[];
  readyIds: string[];
  sort: ReturnType<typeof cmQueueSort>;
  page: number;
  pageSize: number;
  now: Date;
  focusId?: string;
  compact?: boolean;
}) {
  const relevance = Prisma.sql`"opportunityScore" DESC, "createdAt" DESC, id ASC`;
  const order = input.sort === "oldest" ? Prisma.sql`"createdAt" ASC, id ASC`
    : input.sort === "newest" ? Prisma.sql`"createdAt" DESC, id ASC`
      : input.sort === "today" ? Prisma.sql`priority ASC, CASE WHEN priority < 4 THEN "createdAt" END ASC,
        CASE WHEN priority = 4 THEN "opportunityScore" END DESC, "createdAt" DESC, id ASC`
        : relevance;
  const filtered = input.response === "generated"
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Response" r WHERE r."opportunityId" = o.id)`
    : input.response ? Prisma.sql`AND o.id = ANY(${input.ids}::text[])` : Prisma.empty;
  const focusId = typeof input.focusId === "string" && input.focusId.length <= 128 ? input.focusId : undefined;
  const focusPosition = focusId
    ? Prisma.sql`SELECT position FROM (SELECT id, row_number() OVER (ORDER BY ${order}) AS position FROM eligible) ranked WHERE id = ${focusId}`
    : Prisma.sql`SELECT NULL::bigint AS position`;
  const cutoff = new Date(input.now.getTime() - DAY_MS);
  const page = Math.max(1, Math.min(100_000, Math.floor(input.page) || 1));
  const item = input.compact ? Prisma.sql`jsonb_build_object(
    'id', o.id, 'text', o."sourceText", 'title', o."sourceTitle", 'notes', o.notes,
    'author', o."sourceAuthor", 'sourceUrl', o."sourceUrl", 'channel', ${YOUTUBE_OPPORTUNITY_CHANNEL_NAME}::text,
    'brand', coalesce(b.name, 'Marca por definir'), 'product', coalesce(product.name, ''),
    'productId', coalesce(o."detectedProductId", ''), 'createdAt', o."createdAt" AT TIME ZONE 'UTC',
    'status', o.status, 'freshness', 'pending', 'refreshError', '', 'responses', coalesce(proposal.items, '[]'::jsonb)
  )` : Prisma.sql`NULL::jsonb`;
  const details = input.compact ? Prisma.sql`
    FROM "Opportunity" o
    LEFT JOIN "Brand" b ON b.id = o."detectedBrandId" AND b."clientId" = o."clientId"
    LEFT JOIN "Product" product ON product.id = o."detectedProductId" AND product."brandId" = b.id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_array(jsonb_build_object('id', r.id, 'text', coalesce(nullif(r."editedText", ''), r."draftText"),
        'variantType', r."variantType", 'isPrimary', r."isPrimary", 'persona', p.name,
        'acceptedAsCorrect', r."acceptedAsCorrectAt" IS NOT NULL, 'fresh', false, 'chatHistory', '[]'::jsonb)) AS items
      FROM "Response" r JOIN "Persona" p ON p.id = r."personaId"
      WHERE r."opportunityId" = o.id AND (p."clientId" = o."clientId" OR p."clientId" IS NULL)
      ORDER BY r."isPrimary" DESC, r."createdAt" DESC, r.id DESC LIMIT 1
    ) proposal ON true
    WHERE o.id = selected.id` : Prisma.empty;

  const [result] = await db.$queryRaw<QueueResult[]>(Prisma.sql`
    WITH eligible AS (
      SELECT o.id, o."createdAt", o."opportunityScore", o."detectedIntent"::text AS intent, coverage.ready,
        CASE WHEN o."detectedIntent" IN ('PURCHASE_QUESTION', 'PRICE_QUESTION') THEN 1
             WHEN o."createdAt" <= ${cutoff}::timestamptz AT TIME ZONE 'UTC' THEN 2
             WHEN coverage.ready THEN 3 ELSE 4 END AS priority
      FROM "Opportunity" o JOIN "Channel" c ON c.id = o."channelId"
      CROSS JOIN LATERAL (SELECT o.id = ANY(${input.readyIds}::text[]) AS ready) coverage
      WHERE o."clientId" = ${input.clientId} AND c.name = ${YOUTUBE_OPPORTUNITY_CHANNEL_NAME}
        AND o.status::text IN ('NEW', 'NEEDS_REVIEW', 'DRAFTED', 'APPROVED')
        AND NOT EXISTS (SELECT 1 FROM "PublishingLog" log WHERE log."opportunityId" = o.id)
        ${input.brand ? Prisma.sql`AND o."detectedBrandId" = ${input.brand}` : Prisma.empty}
        ${input.channel ? Prisma.sql`AND o."channelId" = ${input.channel}` : Prisma.empty}
        ${filtered}
    ), bounds AS (
      SELECT coalesce(((position - 1) / ${input.pageSize}::int + 1)::int, ${focusId ? 1 : page}::int) AS page,
        (${Boolean(focusId)} AND position IS NULL) AS "targetMissing"
      FROM (SELECT (${focusPosition}) AS position) target
    ), selected AS (
      SELECT * FROM eligible ORDER BY ${order}
      OFFSET (SELECT (page - 1) * ${input.pageSize}::int FROM bounds) LIMIT ${input.pageSize + 1}
    )
    SELECT bounds.*, coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', selected.id, 'intent', selected.intent, 'ready', selected.ready,
        'createdAt', selected."createdAt" AT TIME ZONE 'UTC', 'item', hydrated.item) ORDER BY ${order})
      FROM selected CROSS JOIN LATERAL (SELECT ${item} AS item ${details}) hydrated
    ), '[]'::jsonb) AS rows
    FROM bounds`);

  return {
    page: result.page,
    focusId,
    targetMissing: result.targetMissing,
    nextId: result.rows[input.pageSize]?.id,
    rows: result.rows.slice(0, input.pageSize).map(row => ({
      ...row,
      priorityReasons: input.sort === "today" ? cmPriorityReasons(row.intent, row.createdAt, row.ready, input.now) : [],
    })),
  };
}
