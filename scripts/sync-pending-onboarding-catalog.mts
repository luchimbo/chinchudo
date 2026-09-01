import { prisma } from "../src/lib/db";
import {
  analyzePublicWebsite,
  mergeManualFields,
  parseDomainKeywords,
  sanitizeDraft,
  syncOnboardingCatalog,
  type ConfirmedClientContext,
} from "../src/lib/onboarding";

const onboardingDb = prisma as any;

async function main() {
  const onboardings = await onboardingDb.clientOnboarding.findMany({
    // Sólo continúa el catálogo de onboardings ya aprobados por un humano;
    // nunca importa productos para un borrador todavía en revisión.
    where: { sourceUrl: { not: "" }, status: "COMPLETED" },
    include: { client: true },
  });
  let continued = 0;
  for (const onboarding of onboardings) {
    const previous = sanitizeDraft(onboarding.draft, onboarding.client.name);
    if (!previous.stats.catalogSyncPending) continue;
    const brands = await prisma.brand.findMany({
      where: { clientId: onboarding.clientId },
      select: { name: true },
    });
    const context: ConfirmedClientContext = {
      name: onboarding.client.name,
      brands: brands.map((brand) => brand.name),
      description: onboarding.client.description,
      domainKeywords: parseDomainKeywords(onboarding.client.domainKeywords),
      openrouterApiKey: onboarding.client.openrouterApiKey,
      openrouterModel: onboarding.client.openrouterModel,
    };
    const analysis = await analyzePublicWebsite(
      onboarding.sourceUrl,
      context,
      {
        candidateOffset: previous.stats.catalogNextOffset,
        skipSuggestions: true,
      },
    );
    const draft = mergeManualFields(analysis.draft, previous);
    const catalog = await syncOnboardingCatalog(
      prisma,
      onboarding.clientId,
      draft,
    );
    const next = sanitizeDraft(
      {
        ...draft,
        stats: {
          ...draft.stats,
          importedProducts:
            (previous.stats.importedProducts || 0) + catalog.products,
          importedServices:
            (previous.stats.importedServices || 0) + catalog.services,
        },
      },
      onboarding.client.name,
    );
    await onboardingDb.clientOnboarding.update({
      where: { id: onboarding.id },
      data: { draft: next, analysisError: "" },
    });
    continued += 1;
  }
  console.log(`Sincronizaciones de catálogo continuadas: ${continued}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
