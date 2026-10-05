import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { resolveClientForSlug } from "@/lib/auth";
import { toErrorResponse } from "@/lib/auth-guards";
import { competitorDomain, marketSchema, profilePatchSchema, monthAfter } from "@/lib/business-analysis";
import { editBusinessProfile, enqueueBusinessAnalysis, ensureBusinessProfile, jsonData, readBusinessProfile } from "@/lib/business-analysis-service";
import { assertPublicUrl, normalizeWebsiteUrl } from "@/lib/onboarding";

export const dynamic = "force-dynamic";
const startSchema = z.object({ action: z.enum(["analyze", "retry"]).default("analyze"), sourceUrl: z.string().max(2000).optional(), runId: z.string().max(100).optional(), market: marketSchema.optional() });
const editSchema = z.object({ profile: profilePatchSchema.optional(), monthlyEnabled: z.boolean().optional(), competitor: z.object({ domain: z.string().min(1).max(250), excluded: z.boolean().default(false) }).optional() });
export async function GET(request: NextRequest) {
  try {
    const client = await resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
    const [profile, competitors, runs] = await Promise.all([
      prisma.businessProfile.findUnique({ where: { clientId: client.id } }),
      prisma.businessCompetitor.findMany({ where: { clientId: client.id }, orderBy: [{ excluded: "asc" }, { manual: "desc" }, { createdAt: "asc" }] }),
      prisma.businessAnalysisRun.findMany({ where: { clientId: client.id }, orderBy: { updatedAt: "desc" }, take: 10 }),
    ]);
    const publicRuns = runs.map(({ leaseToken: _token, leaseExpiresAt: _lease, ...run }) => run);
    const activeRun = publicRuns.find(run => ["QUEUED", "RUNNING"].includes(run.status));
    const run = activeRun || publicRuns[0];
    const publications = run ? await prisma.blogPublication.findMany({ where: { clientId: client.id, analysisRunId: run.id }, orderBy: { scheduledDate: "asc" }, include: { landing: { select: { id: true, titulo: true, keyword: true, status: true } } } }) : [];
    return NextResponse.json({ profile, competitors, runs: publicRuns, run: run || null, publications });
  } catch (error) { return toErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    const client = await resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
    const parsed = startSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "La solicitud de análisis no es válida." }, { status: 400 });
    const body = parsed.data;
    if (body.action === "retry") {
      const run = await prisma.businessAnalysisRun.findFirst({ where: { id: body.runId || "", clientId: client.id } });
      if (!run) return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 });
      if (["QUEUED", "RUNNING"].includes(run.status)) return NextResponse.json({ run: { id: run.id, status: run.status, stage: run.stage } }, { status: 202 });
      const retry = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
        const active = await tx.businessAnalysisRun.findFirst({ where: { clientId: client.id, status: { in: ["QUEUED", "RUNNING"] } } });
        if (active) return active;
        const checkpoint = run.checkpoint as Record<string, unknown>;
        // Keep successful first-party analysis/articles; retry the failed external tasks.
        await tx.blogPublication.updateMany({ where: { analysisRunId: run.id, clientId: client.id, landingId: null, status: { not: "SKIPPED" } }, data: { attempts: 0, status: "PLANNED", lastError: "" } });
        return tx.businessAnalysisRun.update({ where: { id: run.id }, data: { status: "QUEUED", attempts: 0, errors: [], finishedAt: null, checkpoint: jsonData({ ...checkpoint, discovery: false, domains: [] }) } });
      });
      return NextResponse.json({ run: { id: retry.id, status: retry.status, stage: retry.stage } }, { status: 202 });
    }
    const sourceUrl = body.sourceUrl === undefined ? undefined : body.sourceUrl.trim() ? normalizeWebsiteUrl(body.sourceUrl) : "";
    if (sourceUrl) await assertPublicUrl(sourceUrl);
    const run = await enqueueBusinessAnalysis(prisma, client, sourceUrl, body.market);
    return NextResponse.json({ run: { id: run.id, status: run.status, stage: run.stage } }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && /URL|dominio|direcci|pública|interna/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return toErrorResponse(error);
  }
}
export async function PATCH(request: NextRequest) {
  try {
    const client = await resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
    const parsed = editSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Los cambios no son válidos." }, { status: 400 });
    const body = parsed.data;
    const profile = await ensureBusinessProfile(prisma, client);
    if (body.competitor) {
      const domain = competitorDomain(body.competitor.domain);
      if (profile.sourceUrl && domain === competitorDomain(profile.sourceUrl)) return NextResponse.json({ error: "Ese es el dominio de tu negocio." }, { status: 400 });
      if (!body.competitor.excluded) await assertPublicUrl(`https://${domain}`);
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
        const existing = await tx.businessCompetitor.findUnique({ where: { clientId_domain: { clientId: client.id, domain } } });
        const count = await tx.businessCompetitor.count({ where: { clientId: client.id, excluded: false } });
        if (!body.competitor!.excluded && (!existing || existing.excluded) && count >= 5) throw new Error("Podés comparar hasta cinco competidores. Quitá uno para reemplazarlo.");
        await tx.businessCompetitor.upsert({ where: { clientId_domain: { clientId: client.id, domain } }, create: { clientId: client.id, domain, manual: true, excluded: body.competitor!.excluded, reason: "Seleccionado por el equipo", sourceUrl: `https://${domain}` }, update: { excluded: body.competitor!.excluded, manual: true } });
      });
    }
    if (body.profile) await editBusinessProfile(prisma, client, body.profile);
    if (body.monthlyEnabled !== undefined) await prisma.businessProfile.update({ where: { clientId: client.id }, data: { monthlyEnabled: body.monthlyEnabled, ...(body.monthlyEnabled && !profile.nextAnalysisAt && profile.lastSuccessfulAt ? { nextAnalysisAt: monthAfter(profile.lastSuccessfulAt, readBusinessProfile(profile.data, client.name).market.timezone) } : {}) } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && /dominio|direcci|pública|interna|cinco competidores/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return toErrorResponse(error);
  }
}
