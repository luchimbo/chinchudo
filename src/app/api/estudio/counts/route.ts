import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { studioCounts } from "@/lib/studio/counts";

export async function GET(req: NextRequest) {
  try {
    const client = await resolveClientForSlug(prisma, req.nextUrl.searchParams.get("client"));
    return NextResponse.json(await studioCounts(client.id));
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
}
