import { Prisma, type PrismaClient, type Landing, type LandingInternalLink, type LeadMagnet } from "@prisma/client";
type ArticleSummary = Pick<Landing, "id" | "titulo" | "slug" | "keyword" | "status" | "createdAt" | "contentType" | "indexingState" | "publicPreviewUrl"> & {
  leadMagnet: Pick<LeadMagnet, "tipo"> | null; blogPublication: { id: string } | null;
  contentCluster: { slug: string; name: string } | null;
  outboundInternalLinks: (Pick<LandingInternalLink, "targetLandingId" | "anchorText" | "mode"> & { targetLanding: { titulo: string; slug: string } })[];
  _count: { leads: number; trackingEvents: number; inboundInternalLinks: number };
};
export async function loadBlogArticleSummaries(db: PrismaClient, clientId: string, status: string, page: number): Promise<ArticleSummary[]> {
  const statuses = status === "PREVIEW_ONLINE" ? ["APPROVED", "PREVIEW_ONLINE"] : [status];
  const rows = await db.$queryRaw<{ item: Omit<ArticleSummary, "createdAt"> & { createdAt: string } }[]>(Prisma.sql`
    SELECT jsonb_build_object('id', l.id, 'titulo', l.titulo, 'slug', l.slug, 'keyword', l.keyword, 'status', l.status,
      'createdAt', l."createdAt" AT TIME ZONE 'UTC', 'contentType', l."contentType", 'indexingState', l."indexingState", 'publicPreviewUrl', l."publicPreviewUrl",
      'leadMagnet', CASE WHEN lm.id IS NULL THEN NULL ELSE jsonb_build_object('tipo', lm.tipo) END,
      'blogPublication', CASE WHEN bp.id IS NULL THEN NULL ELSE jsonb_build_object('id', bp.id) END,
      'contentCluster', CASE WHEN cc.id IS NULL THEN NULL ELSE jsonb_build_object('slug', cc.slug, 'name', cc.name) END,
      'outboundInternalLinks', coalesce((SELECT jsonb_agg(jsonb_build_object('targetLandingId', x."targetLandingId", 'anchorText', x."anchorText", 'mode', x.mode,
        'targetLanding', jsonb_build_object('titulo', target.titulo, 'slug', target.slug)) ORDER BY x.mode DESC, x.position ASC)
        FROM "LandingInternalLink" x JOIN "Landing" target ON target.id = x."targetLandingId" AND target."clientId" = l."clientId"
        WHERE x."sourceLandingId" = l.id AND x."clientId" = l."clientId"), '[]'::jsonb),
      '_count', jsonb_build_object(
        'leads', (SELECT count(*) FROM "Lead" WHERE "landingId" = l.id AND "clientId" = l."clientId"),
        'trackingEvents', (SELECT count(*) FROM "TrackingEvent" WHERE "landingId" = l.id AND "clientId" = l."clientId" AND "eventType" = 'page_view'),
        'inboundInternalLinks', (SELECT count(*) FROM "LandingInternalLink" WHERE "targetLandingId" = l.id AND "clientId" = l."clientId" AND mode::text != 'EXCLUDED'))) AS item
    FROM "Landing" l
    LEFT JOIN "LeadMagnet" lm ON lm.id = l."leadMagnetId"
    LEFT JOIN "ContentCluster" cc ON cc.id = l."contentClusterId" AND cc."clientId" = l."clientId"
    LEFT JOIN "BlogPublication" bp ON bp."landingId" = l.id AND bp."clientId" = l."clientId"
    WHERE l."clientId" = ${clientId} AND l.status::text = ANY(${statuses}::text[])
    ORDER BY l."createdAt" DESC, l.id ASC OFFSET ${(page - 1) * 20} LIMIT 20`);
  return rows.map(({ item }) => ({ ...item, createdAt: new Date(item.createdAt) }));
}
