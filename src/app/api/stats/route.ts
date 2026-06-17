import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [totalLandings, publishedLandings, totalLeads, totalEvents] = await Promise.all([
      prisma.landing.count(),
      prisma.landing.count({ where: { status: "PUBLISHED" } }),
      prisma.lead.count(),
      prisma.trackingEvent.count(),
    ]);

    const eventsByType = await prisma.trackingEvent.groupBy({
      by: ["eventType"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const topLandings = await prisma.trackingEvent.groupBy({
      by: ["slug"],
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
