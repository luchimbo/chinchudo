import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ClientResolutionError, resolveClientForSlug } from "@/lib/auth";
import {
  analyzePublicWebsite,
  defaultDraft,
  mergeManualFields,
  parseDomainKeywords,
  sanitizeDraft,
  syncOnboarding,
  type ConfirmedClientContext,
} from "@/lib/onboarding";
import { getOnboardingCompletionIssues } from "@/lib/onboarding-completion";
import { normalizeWebsiteUrl } from "@/lib/website-url";
import type { Client } from "@prisma/client";

export const dynamic = "force-dynamic";
const onboardingDb = prisma as any;

async function clientForRequest(request: NextRequest) {
  return resolveClientForSlug(prisma, request.nextUrl.searchParams.get("client"));
}

async function confirmedContextFor(client: Client): Promise<ConfirmedClientContext> {
  const brands = await prisma.brand.findMany({
    where: { clientId: client.id },
    select: { name: true },
  });
  return {
    name: client.name,
    brands: brands.map((brand) => brand.name),
    description: client.description,
    domainKeywords: parseDomainKeywords(client.domainKeywords),
    openrouterApiKey: client.openrouterApiKey,
    openrouterModel: client.openrouterModel,
  };
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
        draft: sanitizeDraft(onboarding.draft, client.name),
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
    // El autosave sólo persiste el borrador: nunca escribe Client/Brand/Product/Persona,
    // y no revierte un onboarding ya COMPLETED a IN_REVIEW.
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
      const existing = await onboardingDb.clientOnboarding.upsert({
        where: { clientId: client.id },
        create: {
          clientId: client.id,
          sourceUrl: url,
          status: "ANALYZING",
          draft: defaultDraft(client.name),
        },
        update: { sourceUrl: url, status: "ANALYZING", analysisError: "" },
      });
      try {
        const context = await confirmedContextFor(client);
        const analysis = await analyzePublicWebsite(url, context);
        const previousDraft = sanitizeDraft(existing.draft, client.name);
        // El análisis sólo guarda el borrador y las páginas leídas: no importa
        // catálogo ni toca Brand/Product hasta que el cliente confirme.
        const draft = mergeManualFields(analysis.draft, previousDraft);
        const importedDraft = sanitizeDraft(draft, client.name);
        const onboarding = await onboardingDb.clientOnboarding.update({
          where: { clientId: client.id },
          data: { status: "IN_REVIEW", draft: importedDraft },
        });
        await onboardingDb.onboardingSourcePage.deleteMany({
          where: { onboardingId: onboarding.id },
        });
        if (analysis.pages.length)
          await onboardingDb.onboardingSourcePage.createMany({
            data: analysis.pages.map((page) => ({
              onboardingId: onboarding.id,
              url: page.url,
              title: page.title,
              pageType: page.pageType,
              contentHash: page.hash,
              excerpt: page.text.slice(0, 4000),
              extracted: {
                offerings: page.offerings,
                socialNetworks: page.socialNetworks,
                platform: page.platform,
              },
            })),
          });
        return NextResponse.json({
          onboarding: { ...onboarding, draft: importedDraft },
          analysis: {
            pages: analysis.pages.map((page) => ({
              url: page.url,
              title: page.title,
              pageType: page.pageType,
            })),
            stats: analysis.draft.stats,
          },
          warning: analysis.warning,
        });
      } catch (error) {
        const onboarding = await onboardingDb.clientOnboarding.update({
          where: { clientId: client.id },
          data: {
            status: "IN_REVIEW",
            analysisError: (error as Error).message,
          },
        });
        return NextResponse.json({
          onboarding: {
            ...onboarding,
            draft: sanitizeDraft(onboarding.draft, client.name),
          },
          warning: (error as Error).message,
        });
      }
    }
    const onboarding = await onboardingDb.clientOnboarding.findUniqueOrThrow({
      where: { clientId: client.id },
    });
    const draft = sanitizeDraft(onboarding.draft, client.name);
    if (body.action === "complete") {
      const issues = getOnboardingCompletionIssues(draft);
      if (issues.length) {
        return NextResponse.json(
          {
            error: `Completá ${issues.map((issue) => issue.label).join(", ")} antes de activar.`,
            issues,
          },
          { status: 400 },
        );
      }
      const approvedDraft = { ...draft, knowledgeApproved: true };
      // Único punto que sincroniza Client/Brand/Product/Persona/MonitoredSource,
      // atómicamente junto con el pase a COMPLETED.
      await syncOnboarding(prisma, client.id, approvedDraft, {
        completeOnboardingId: onboarding.id,
      });
      const completed = await onboardingDb.clientOnboarding.findUniqueOrThrow({
        where: { clientId: client.id },
      });
      return NextResponse.json({ onboarding: completed });
    }
    return NextResponse.json(
      { error: "Acción no reconocida." },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la acción. Intentá de nuevo." },
      { status: 400 },
    );
  }
}
