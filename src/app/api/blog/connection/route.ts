import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { readAgentConnection } from "@/app/(app)/(creador)/blog/calendario/agent-connection";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await resolveClientForSlug(prisma, new URL(request.url).searchParams.get("client"));
    return NextResponse.json(await readAgentConnection(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return toErrorResponse(error); }
}
