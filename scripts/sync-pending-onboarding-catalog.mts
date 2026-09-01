import { prisma } from "../src/lib/db";
import {
  analyzePublicWebsite,
  mergeManualFields,
  sanitizeDraft,
  syncOnboardingCatalog,
} from "../src/lib/onboarding";

const onboardingDb = prisma as any;

async function main() {
  const onboardings = await onboardingDb.clientOnboarding.findMany({
    where: { sourceUrl: { not: "" } },
    include: { client: true },
  });
  let continued = 0;
  for (const onboarding of onboardings) {
    const previous = sanitizeDraft(onboarding.draft, onboarding.client.name);
    if (!previous.stats.catalogSyncPending) continue;
    const analysis = await analyzePublicWebsite(
      onboarding.sourceUrl,
      onboarding.client.name,
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
            previous.stats.importedProducts + catalog.products,
          importedServices:
            previous.stats.importedServices + catalog.services,
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
