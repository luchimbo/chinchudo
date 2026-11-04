import { Prisma, type PrismaClient } from "@prisma/client";
import type { cmOpportunityView } from "./cm-opportunity-view";

/** A single round trip replaces six Prisma relation queries for the inbox. */
export async function loadCMSummaries(db: PrismaClient, input: { clientId: string; brand: string; channel: string; response: string; ids: string[]; sort: string; page: number }) {
  const order = input.sort === "oldest" ? Prisma.sql`o."createdAt" ASC, o.id ASC` : input.sort === "newest" ? Prisma.sql`o."createdAt" DESC, o.id ASC` : Prisma.sql`o."opportunityScore" DESC, o."createdAt" DESC, o.id ASC`;
  const filtered = input.response === "generated" ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Response" r WHERE r."opportunityId" = o.id)` : input.response ? Prisma.sql`AND o.id = ANY(${input.ids}::text[])` : Prisma.empty;
  const rows = await db.$queryRaw<{ item: ReturnType<typeof cmOpportunityView> }[]>(Prisma.sql`
    SELECT jsonb_build_object('id', o.id, 'text', o."sourceText", 'title', o."sourceTitle", 'notes', o.notes,
      'author', o."sourceAuthor", 'sourceUrl', o."sourceUrl", 'channel', c.name,
      'brand', coalesce(b.name, 'Marca por definir'), 'product', coalesce(product.name, ''), 'productId', coalesce(o."detectedProductId", ''),
      'createdAt', o."createdAt" AT TIME ZONE 'UTC', 'status', o.status, 'freshness', 'pending', 'refreshError', '',
      'responses', coalesce(proposal.items, '[]'::jsonb)) AS item
    FROM "Opportunity" o JOIN "Channel" c ON c.id = o."channelId"
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
    WHERE o."clientId" = ${input.clientId} AND c.name = 'YouTube'
      AND o.status::text IN ('NEW', 'NEEDS_REVIEW', 'DRAFTED', 'APPROVED')
      AND NOT EXISTS (SELECT 1 FROM "PublishingLog" log WHERE log."opportunityId" = o.id)
      ${input.brand ? Prisma.sql`AND o."detectedBrandId" = ${input.brand}` : Prisma.empty}
      ${input.channel ? Prisma.sql`AND o."channelId" = ${input.channel}` : Prisma.empty}
      ${filtered}
    ORDER BY ${order} OFFSET ${(input.page - 1) * 20} LIMIT 21`);
  return rows.map(row => row.item);
}
