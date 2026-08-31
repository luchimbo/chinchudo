import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertClientAccess } from "@/lib/auth";
import {
  SEARCH_CHANNELS,
  SEARCH_LANGUAGES,
  createOpportunitySearchJob,
  getOpportunitySearchJob,
} from "@/lib/opportunity-search-jobs";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  clientId: z.string().min(1),
  channels: z.array(z.enum(SEARCH_CHANNELS)).length(1).refine((channels) => channels[0] === "youtube", "Solo YouTube está disponible."),
  query: z.string().max(400).default(""),
  queries: z.array(z.string().min(1).max(120)).max(100).optional(),
  language: z.enum(SEARCH_LANGUAGES).default("es"),
  limit: z.coerce.number().int().min(1).max(500).default(5),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = searchSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Parametros invalidos.", details: result.error.flatten() }, { status: 400 });
  }
  try {
    await assertClientAccess(prisma, result.data.clientId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cliente no autorizado." }, { status: 403 });
  }
  const job = createOpportunitySearchJob(result.data);
  return NextResponse.json({ jobId: job.id, job });
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Falta id de busqueda." }, { status: 400 });
  const job = getOpportunitySearchJob(id);
  if (!job) return NextResponse.json({ error: "Busqueda no encontrada." }, { status: 404 });
  try {
    await assertClientAccess(prisma, job.params.clientId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cliente no autorizado." }, { status: 403 });
  }
  return NextResponse.json({ job });
}
