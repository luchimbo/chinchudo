import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { cmViewInclude, cmOpportunityView } from "@/lib/cm-opportunity-view";
import { readCoverageSnapshot } from "@/lib/cm-coverage-snapshot";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const query = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, query.get("client"));
    const [row, snapshot] = await Promise.all([prisma.opportunity.findFirst({ where: { id: params.id, clientId: client.id }, include: cmViewInclude }), readCoverageSnapshot(prisma, client.id)]);
    if (!row) return NextResponse.json({ error: "Oportunidad no disponible." }, { status: 404 });
    const summary = snapshot.rows.find(r => r.id === row.id);
    return NextResponse.json({ opportunity: { ...cmOpportunityView(row, snapshot.pending ? "" : snapshot.version, snapshot.pending ? "pending" : summary?.status, summary?.error, query.get("history") === "1"), coverageRevision: summary?.revision || "" } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}
