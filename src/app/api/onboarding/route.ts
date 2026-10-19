import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";
import {
  analyzePublicWebsite,
  defaultDraft,
  mergeManualFields,
  OnboardingNameConflictError,
  sanitizeDraft,
  syncOnboarding,
} from "@/lib/onboarding";
import { getOnboardingCompletionIssues } from "@/lib/onboarding-completion";
import { confirmedDraftFor } from "@/lib/onboarding-rehydrate";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import { logger } from "@/lib/logger";
import type { Client } from "@prisma/client";
import { analyzeRequestedCatalog, enqueueBusinessAnalysis, readBusinessProfile, saveBasicAnalysis, syncBusinessDraft } from "@/lib/business-analysis-service";
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
    const existing = await onboardingDb.clientOnboarding.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, draft: defaultDraft(client.name) },
      update: {},
    });
    const draft = sanitizeDraft(
      { ...(existing.draft as object), ...(body.draft as object) },
      client.name,
    );
    const currentStep = Math.max(
      1,
      Math.min(3, Number(body.currentStep) || existing.currentStep),
    );
    // Conserva COMPLETED. Cuando ya existe un perfil utilizable, sus correcciones
    // también se aplican al contexto; no aprueba conocimientos ni publicaciones.
    const onboarding = await onboardingDb.clientOnboarding.update({
      where: { clientId: client.id },
      data: {
        draft,
        sourceUrl:
          typeof body.sourceUrl === "string"
            ? body.sourceUrl.slice(0, 2000)
            : existing.sourceUrl,
        businessType:
          typeof body.businessType === "string"
            ? body.businessType.slice(0, 30)
            : existing.businessType,
        currentStep,
        status: existing.status === "COMPLETED" ? existing.status : "IN_REVIEW",
        analysisError: "",
      },
    });
    const businessProfile = await prisma.businessProfile.findUnique({ where: { clientId: client.id } });
    if (businessProfile?.lastSuccessfulAt || (draft.description && draft.offer && draft.manualFields.length)) {
      await syncBusinessDraft(prisma, client, draft, Array.isArray(body.changedFields) ? body.changedFields.filter((field: unknown) => typeof field === "string").slice(0, 100) : draft.manualFields, body.resetManualCorrections === true);
    }
    if (currentStep > existing.currentStep) {
      logger.info("onboarding_step_reached", "Avanzó de paso en el onboarding", {
        clientId: client.id,
        step: currentStep,
        fromStep: existing.currentStep,
        secondsSinceCreated: Math.round(
          (Date.now() - new Date(existing.createdAt).getTime()) / 1000,
        ),
      });
    }
    return NextResponse.json({ onboarding: { ...onboarding, draft } });
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

    const onboarding = await onboardingDb.clientOnboarding.findUniqueOrThrow({
      where: { clientId: client.id },
    });
    const businessProfile = await prisma.businessProfile.findUnique({ where: { clientId: client.id } });
    const previousProfile = businessProfile ? readBusinessProfile(businessProfile.data, client.name) : null;
    const draft = previousProfile ? mergeManualFields(sanitizeDraft(onboarding.draft, client.name), previousProfile.draft) : sanitizeDraft(onboarding.draft, client.name);
    if (body.action === "complete") {
      const issues = getOnboardingCompletionIssues(draft);
      if (issues.length) {
        logger.info("onboarding_completion_blocked", "Intentó activar con campos pendientes", {
          clientId: client.id,
          issues: issues.map((issue) => issue.key),
        });
        return NextResponse.json(
          {
            error: `Completá ${issues.map((issue) => issue.label).join(", ")} antes de activar.`,
            issues,
          },
          { status: 400 },
        );
      }
      const mode = onboarding.status === "COMPLETED" ? "edit" : "setup";
      const approvedDraft = { ...draft, knowledgeApproved: true };
      // Human confirmation is the only step granting confidence to knowledge.
      await syncOnboarding(prisma, client.id, approvedDraft, {
        completeOnboardingId: onboarding.id,
      });
      await syncBusinessDraft(prisma, client, approvedDraft);
      if (!draft.analysisRunId) await enqueueBusinessAnalysis(prisma, client, onboarding.sourceUrl || "", draft.market);
      const completed = await onboardingDb.clientOnboarding.findUniqueOrThrow({
        where: { clientId: client.id },
      });
      logger.info("onboarding_completed", "Activó la configuración", {
        clientId: client.id,
        mode,
        products: draft.offerings.filter((item) => item.kind === "product").length,
        services: draft.offerings.filter((item) => item.kind === "service").length,
        networks: draft.selectedNetworks.length,
        manualFieldCount: draft.manualFields.length,
      });
      return NextResponse.json({ onboarding: completed });
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
