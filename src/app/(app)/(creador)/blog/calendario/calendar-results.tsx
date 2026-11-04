import { prisma } from "@/lib/db";
import { blogReferral } from "@/lib/blog-referrals";
import { operationTiming } from "@/lib/performance";
export async function CalendarResults({ clientId, landingId }: { clientId: string; landingId: string }) {
  const [events, leads, peerCount, peerViews, referrals] = await operationTiming("blog-results").measure("queries", () => Promise.all([
    prisma.trackingEvent.groupBy({ by: ["eventType"], _count: { id: true }, where: { clientId, landingId, eventType: { in: ["page_view", "store_click"] } } }),
    prisma.lead.count({ where: { clientId, landingId } }),
    prisma.blogPublication.count({ where: { clientId, status: "PUBLISHED", landingId: { not: landingId } } }),
    prisma.trackingEvent.count({ where: { clientId, eventType: "page_view", landingId: { not: landingId }, landing: { blogPublication: { is: { status: "PUBLISHED" } } } } }),
    prisma.trackingEvent.groupBy({ by: ["referrer"], _count: { id: true }, where: { clientId, landingId, eventType: "page_view" } }),
  ]));
  const views = events.find(e => e.eventType === "page_view")?._count.id || 0;
  const clicks = events.find(e => e.eventType === "store_click")?._count.id || 0;
  const sources = new Map<string, number>();
  for (const row of referrals) { const label = blogReferral(row.referrer); sources.set(label, (sources.get(label) || 0) + row._count.id); }
  return <>
    <p className="text-sm text-slate">{views} visitas · {clicks} clics · {leads} contactos</p>
    {peerCount >= 3 ? <p className="text-xs text-slate">Promedio de los demás artículos publicados: {Math.round(peerViews / peerCount)} visitas.</p> : null}
    {sources.size ? <details className="text-xs text-slate"><summary className="cursor-pointer font-semibold">Procedencia de visitas</summary>{[...sources].map(([label, n]) => <p key={label}>{label}: {n}</p>)}</details> : null}
  </>;
}
