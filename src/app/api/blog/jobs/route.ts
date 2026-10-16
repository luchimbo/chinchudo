import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { taskJob } from "@/lib/blog-tasks";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, query.get("client"));
    const ids = [...new Set((query.get("ids") || "").split(",").filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, 20);
    const active: Prisma.BlogPublicationWhereInput[] = [{ status: "PUBLISHING" }];
    if (client.slug === "pcmidi") for (const phase of ["GENERATING", "REVIEWING"]) active.push({ status: "PLANNED", preparation: { path: ["phase"], equals: phase } });
    if (ids.length) active.push({ id: { in: ids } });
    const rows = await prisma.blogPublication.findMany({
      where: { clientId: client.id, OR: active },
      select: { id: true, status: true, lastError: true, errorCode: true, preparation: true, needsDeploy: true, updatedAt: true, scheduledDate: true, plannedTitle: true, requiresApproval: true, landingId: true, landing: { select: { titulo: true, slug: true, contentCluster: { select: { slug: true } } } } },
      orderBy: { updatedAt: "desc" }, take: 40,
    });
    return NextResponse.json({ jobs: rows.map(row => taskJob(row, client.blogBaseUrl)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}
