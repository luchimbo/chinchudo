import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";

export async function GET(request: NextRequest) {
  let client;
  try {
    client = await resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
  } catch (err) {
    if (err instanceof ClientResolutionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  const clientId = client.id;

  try {
    const [totalLandings, publishedLandings, totalLeads, totalEvents] = await Promise.all([
      prisma.landing.count({ where: { clientId } }),
      prisma.landing.count({ where: { clientId, status: "PUBLISHED" } }),
      prisma.lead.count({ where: { clientId } }),
      prisma.trackingEvent.count({ where: { clientId } }),
    ]);

    const eventsByType = await prisma.trackingEvent.groupBy({
      by: ["eventType"],
      where: { clientId },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const topLandings = await prisma.trackingEvent.groupBy({
      by: ["slug"],
      where: { clientId },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    return NextResponse.json({
      landings: { total: totalLandings, published: publishedLandings },
      leads: { total: totalLeads },
      events: {
        total: totalEvents,
        byType: Object.fromEntries(eventsByType.map((r) => [r.eventType, r._count.id])),
      },
      topLandings: topLandings.map((r) => ({ slug: r.slug, views: r._count.id })),
    });
  } catch (err) {
    console.error("[api/stats]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
