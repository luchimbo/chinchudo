import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { publicationJob } from "@/lib/blog-publications";
import type { BlogPublicationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, query.get("client"));
    const ids = [...new Set((query.get("ids") || "").split(",").filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)))].slice(0, 20);
    const terminalStatuses: BlogPublicationStatus[] = ["PUBLISHED", "FAILED"];
    const rows = await prisma.blogPublication.findMany({
      where: { clientId: client.id, OR: [{ status: "PUBLISHING" }, ...(ids.length ? [{ id: { in: ids }, status: { in: terminalStatuses } }] : [])] },
      select: { id: true, status: true, lastError: true, needsDeploy: true, updatedAt: true, landing: { select: { titulo: true, slug: true, publicPreviewUrl: true, contentCluster: { select: { slug: true } } } } },
      orderBy: { updatedAt: "desc" }, take: 20,
    });
    return NextResponse.json({ jobs: rows.map(row => publicationJob(row, client.blogBaseUrl)) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}
