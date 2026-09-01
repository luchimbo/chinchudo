import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import {
  analyzePublicWebsite,
  defaultDraft,
  getOnboardingCompletionIssues,
  mergeManualFields,
  sanitizeDraft,
  syncOnboarding,
  syncOnboardingCatalog,
} from "@/lib/onboarding";
import { normalizeWebsiteUrl } from "@/lib/website-url";

export const dynamic = "force-dynamic";
const onboardingDb = prisma as any;

async function clientForRequest() {
  const clients = await getVisibleClients(prisma);
  const client = clients[0];
  if (!client) throw new Error("No tenés un espacio de trabajo disponible.");
  return client;
}

export async function GET() {
  try {
    const client = await clientForRequest();
    const onboarding = await onboardingDb.clientOnboarding.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, draft: defaultDraft(client.name) },
      update: {},
    });
    return NextResponse.json({
      onboarding: {
        ...onboarding,
        draft: sanitizeDraft(onboarding.draft, client.name),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 401 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const client = await clientForRequest();
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
        status: "IN_REVIEW",
        analysisError: "",
      },
    });
    await syncOnboarding(prisma, client.id, draft);
    return NextResponse.json({ onboarding: { ...onboarding, draft } });
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo guardar. Revisá tu conexión e intentá de nuevo." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const client = await clientForRequest();
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
        const analysis = await analyzePublicWebsite(url, client.name);
        const previousDraft = sanitizeDraft(existing.draft, client.name);
        const draft = mergeManualFields(analysis.draft, previousDraft);
        const catalog = await syncOnboardingCatalog(prisma, client.id, draft);
        const importedDraft = sanitizeDraft(
          {
            ...draft,
            stats: {
              ...draft.stats,
              importedProducts: catalog.products,
              importedServices: catalog.services,
            },
          },
          client.name,
        );
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
      await syncOnboarding(prisma, client.id, approvedDraft);
      const completed = await onboardingDb.clientOnboarding.update({
        where: { clientId: client.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          currentStep: 3,
          draft: approvedDraft,
        },
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
