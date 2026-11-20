import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { readCoverageSnapshot } from "@/lib/cm-coverage-snapshot";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const client = await resolveClientForSlug(prisma, query.get("client"));
    const snapshot = await readCoverageSnapshot(prisma, client.id);
    const ids = new Set((query.get("ids") || "").split(",").filter(id => /^[a-zA-Z0-9_-]{1,100}$/.test(id)).slice(0, 20));
    return NextResponse.json({ ...snapshot, rows: query.has("ids") ? snapshot.rows.filter(row => ids.has(row.id)) : snapshot.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}
