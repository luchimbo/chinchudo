import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";
import {
  analyzePublicWebsite,
  defaultDraft,
  OnboardingNameConflictError,
  sanitizeDraft,
  syncOnboarding,
} from "@/lib/onboarding";
import { getOnboardingCompletionIssues } from "@/lib/onboarding-completion";
import { confirmedDraftFor } from "@/lib/onboarding-rehydrate";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { logger } from "@/lib/logger";
import type { Client } from "@prisma/client";
import { analyzeRequestedCatalog, enqueueBusinessAnalysis, readBusinessProfile, saveBasicAnalysis, syncBusinessDraft, transactionDatabase, jsonData } from "@/lib/business-analysis-service";
import { activationDraft, welcomeDestination, WELCOME_CHOICES, type FirstUseGoal } from "@/lib/onboarding-welcome";
import { withAbortSignal } from "@/lib/abortable";
import { marketSchema } from "@/lib/business-analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
const onboardingDb = prisma as any;

async function clientForRequest(request: NextRequest) {
  return resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
}

export async function GET(request: NextRequest) {
  try {
    const client = await clientForRequest(request);
    const onboarding = await onboardingDb.clientOnboarding.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, draft: defaultDraft(client.name) },
      update: {},
    });
    return NextResponse.json({
      client: { slug: client.slug, name: client.name },
      onboarding: {
        ...onboarding,
        draft: await confirmedDraftFor(prisma, client, onboarding),
      },
    });
  } catch (error) {
    const status = error instanceof ClientResolutionError ? error.status : 401;
    return NextResponse.json(
      { error: (error as Error).message },
      { status },
    );
  }
}

export async function PATCH(request: NextRequest) {
  let client: Client;
  try {
    client = await clientForRequest(request);
  } catch (error) {
    const status = error instanceof ClientResolutionError ? error.status : 401;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
  try {
    const body = await request.json();
    const onboarding = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
      const existing = await tx.clientOnboarding.upsert({ where: { clientId: client.id }, create: { clientId: client.id, draft: defaultDraft(client.name) }, update: {} });
      const stored = existing.draft as Record<string, unknown>;
      const previousSave = stored.__onboardingSave as { session?: string; revision?: number } | undefined;
      const versioned = typeof body.saveSession === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(body.saveSession) && Number.isSafeInteger(body.saveRevision) && body.saveRevision >= 0;
      if (versioned && previousSave?.session === body.saveSession && (previousSave?.revision ?? -1) >= body.saveRevision) return existing;
      const oldDraft = sanitizeDraft(existing.draft, client.name);
      const draft = sanitizeDraft({ ...stored, ...(body.draft as object),
        firstUseGoal: oldDraft.firstUseGoal, welcomeCompleted: oldDraft.welcomeCompleted,
        knowledgeApproved: oldDraft.knowledgeApproved && JSON.stringify((body.draft as any)?.knowledge ?? oldDraft.knowledge) === JSON.stringify(oldDraft.knowledge),
        ...(versioned ? { __onboardingSave: { session: body.saveSession, revision: body.saveRevision } } : { __onboardingSave: previousSave }),
      }, client.name);
      const currentStep = Math.max(1, Math.min(3, Number(body.currentStep) || existing.currentStep));
      const saved = await tx.clientOnboarding.update({ where: { clientId: client.id }, data: {
        draft: jsonData(draft), sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl.slice(0, 2000) : existing.sourceUrl,
        businessType: typeof body.businessType === "string" ? body.businessType.slice(0, 30) : existing.businessType,
        currentStep, status: existing.status === "COMPLETED" ? existing.status : "IN_REVIEW", analysisError: "",
      } });
      const profile = await tx.businessProfile.findUnique({ where: { clientId: client.id } });
      if (profile || existing.status === "COMPLETED") await syncBusinessDraft(transactionDatabase(tx), client, draft,
        Array.isArray(body.changedFields) ? body.changedFields.filter((field: unknown) => typeof field === "string").slice(0, 100) : draft.manualFields,
        body.resetManualCorrections === true, { applyContext: existing.status === "COMPLETED" });
      return { ...saved, draft };
    }, { timeout: 20000, maxWait: 3000 });
    return NextResponse.json({ onboarding });
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar. Revisá tu conexión e intentá de nuevo." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  let client: Client;
  try {
    client = await clientForRequest(request);
  } catch (error) {
    const status = error instanceof ClientResolutionError ? error.status : 401;
    return NextResponse.json({ error: (error as Error).message }, { status });
  }
  try {
    const body = await request.json();
    if (body.action === "analyze") {
      const url = normalizeWebsiteUrl(String(body.url || ""));
      if (!/^https?:\/\//i.test(url))
        return NextResponse.json(
          { error: "Ingresá una dirección web válida." },
          { status: 400 },
        );
      const market = body.market ? marketSchema.parse(body.market) : undefined;
      const analysis = await analyzePublicWebsite(url, { name: client.name, brands: [], description: "", domainKeywords: [], openrouterApiKey: client.openrouterApiKey, openrouterModel: client.openrouterModel }, { mode: "basic", signal: request.signal });
      request.signal.throwIfAborted();
      const { draft, run } = await saveBasicAnalysis(prisma, client, analysis, url, market);
      return NextResponse.json({ draft, warning: analysis.warning, run: { id: run.id, status: run.status, stage: run.stage } });
    }

    if (body.action === "analyzeCatalog") return NextResponse.json(await analyzeRequestedCatalog(prisma, client, request.signal));

    if (body.action === "welcome") {
      if (body.goal !== "" && !WELCOME_CHOICES.some(choice => choice.goal === body.goal)) return NextResponse.json({ error: "Elegí una de las opciones para empezar." }, { status: 400 });
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
        const onboarding = await tx.clientOnboarding.findUniqueOrThrow({ where: { clientId: client.id } });
        if (onboarding.status !== "COMPLETED") throw new Error("Activá el negocio antes de empezar.");
        const draft = { ...sanitizeDraft(onboarding.draft, client.name), firstUseGoal: body.goal as FirstUseGoal | "", welcomeCompleted: true };
        await tx.clientOnboarding.update({ where: { clientId: client.id }, data: { draft: jsonData(draft) } });
        const profile = await tx.businessProfile.findUnique({ where: { clientId: client.id } });
        if (profile) { const data = readBusinessProfile(profile.data, client.name); await tx.businessProfile.update({ where: { id: profile.id }, data: { data: jsonData({ ...data, draft: { ...data.draft, firstUseGoal: draft.firstUseGoal, welcomeCompleted: true } }) } }); }
      }, { timeout: 15000, maxWait: 3000 });
      return NextResponse.json({ next: welcomeDestination(body.goal, client.slug) });
    }
    if (body.action === "complete") {
      const result = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "Client" WHERE id = ${client.id} FOR UPDATE`;
        const onboarding = await tx.clientOnboarding.findUniqueOrThrow({ where: { clientId: client.id } });
        const draft = sanitizeDraft(onboarding.draft, client.name);
        const issues = getOnboardingCompletionIssues(draft);
        if (issues.length) return { issues, draft, onboarding };
        const approved = activationDraft(draft, onboarding.status === "COMPLETED", body.knowledgeReviewed === true);
        const db = transactionDatabase(tx);
        await syncOnboarding(db, client.id, approved, { completeOnboardingId: onboarding.id, preserveCommercialTerms: true });
        await syncBusinessDraft(db, client, approved, [], false, { applyContext: false });
        const completed = await tx.clientOnboarding.findUniqueOrThrow({ where: { clientId: client.id } });
        return { issues: [], draft: approved, onboarding: completed };
      }, { timeout: 25000, maxWait: 3000 });
      if (result.issues.length) return NextResponse.json({ error: "Completá el nombre del negocio y qué ofrece para empezar.", issues: result.issues }, { status: 400 });
      // Queueing extra research is useful, but must never undo a completed setup.
      if (!result.draft.analysisRunId) {
        await withAbortSignal(enqueueBusinessAnalysis(prisma, client, result.onboarding.sourceUrl || "", result.draft.market), AbortSignal.timeout(2000))
          .catch(() => { void logger.warn("onboarding_queue_pending", "La configuración se guardó; la investigación posterior quedó pendiente.", { clientId: client.id }); });
      }
      void logger.info("onboarding_completed", "Confirmó los datos básicos", { clientId: client.id });
      return NextResponse.json({ onboarding: result.onboarding, next: result.draft.welcomeCompleted === false ? `/bienvenida?client=${encodeURIComponent(client.slug)}` : null });
    }
    return NextResponse.json(
      { error: "Acción no reconocida." },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof OnboardingNameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: bodyActionError(error) },
      { status: 400 },
    );
  }
}

function bodyActionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/^(?:Ingresá una dirección|La URL|La página|La lectura|El sitio|El dominio|El análisis|El catálogo|No se permiten direcciones|No pudimos resolver|No pudimos leer|Activá el negocio|Agregá una web|Ya hay una lectura|Hay un análisis de otra web|Demasiadas redirecciones)/.test(message)) return message;
  return "No se pudo completar la acción. Revisá tu conexión e intentá de nuevo; también podés completar los datos a mano.";
}
