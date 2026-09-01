// Solo lectura: audita el estado del onboarding de PC MIDI y prestige-running
// antes/después de la reparación de datos contaminados. No escribe nada.
import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();
const onboardingDb = prisma as any;

const CONTAMINATED_BRAND_NAME = "Tienda Online de Prestige Running";
const PCMIDI_SLUG = "pcmidi";
const PRESTIGE_SLUG = "prestige-running";

const PCMIDI_SEED_PERSONA_TONES: Record<string, string> = {
  "Técnico": "Preciso, practico y sin vender de mas.",
  "Práctico": "Cotidiano, cercano y concreto.",
  "Innovación": "Moderno, curioso y aspiracional, sin exagerar datos.",
  "Educativo": "Didactico, criterioso y simple.",
  "Comercial": "Directo, entusiasta y practico.",
};
const PCMIDI_SEED_DESCRIPTION =
  "Instrumentos musicales, controladores MIDI, interfaces de audio, baterias electronicas y home studio.";

async function main() {
  const pcmidi = await prisma.client.findUnique({ where: { slug: PCMIDI_SLUG } });
  const prestige = await prisma.client.findUnique({ where: { slug: PRESTIGE_SLUG } });

  const onboardings = await onboardingDb.clientOnboarding.findMany({
    where: { clientId: { in: [pcmidi?.id, prestige?.id].filter(Boolean) as string[] } },
    include: { client: { select: { slug: true, name: true } } },
  });

  const pcmidiBrands = pcmidi
    ? await prisma.brand.findMany({ where: { clientId: pcmidi.id } })
    : [];
  const contaminatedBrand = pcmidiBrands.find((brand) => brand.name === CONTAMINATED_BRAND_NAME);

  let contaminatedBrandDetail: Record<string, unknown> | null = null;
  if (contaminatedBrand) {
    const products = await prisma.product.findMany({ where: { brandId: contaminatedBrand.id } });
    const productIds = products.map((product) => product.id);
    const opportunitiesOnProducts = productIds.length
      ? await prisma.opportunity.count({ where: { detectedProductId: { in: productIds } } })
      : 0;
    const opportunitiesOnBrand = await prisma.opportunity.count({
      where: { detectedBrandId: contaminatedBrand.id },
    });
    const responsesOnBrand = await prisma.response.count({ where: { brandId: contaminatedBrand.id } });
    const videosOnBrand = await prisma.videoScript.count({ where: { brandId: contaminatedBrand.id } });
    const videosOnProducts = productIds.length
      ? await prisma.videoScript.count({ where: { productId: { in: productIds } } })
      : 0;
    contaminatedBrandDetail = {
      id: contaminatedBrand.id,
      name: contaminatedBrand.name,
      createdAt: contaminatedBrand.createdAt,
      updatedAt: contaminatedBrand.updatedAt,
      productCount: products.length,
      products: products.map((product) => ({ id: product.id, name: product.name, sourceType: product.sourceType, createdAt: product.createdAt })),
      opportunitiesOnProducts,
      opportunitiesOnBrand,
      responsesOnBrand,
      videosOnBrand,
      videosOnProducts,
      safeToDelete:
        opportunitiesOnProducts === 0 &&
        opportunitiesOnBrand === 0 &&
        responsesOnBrand === 0 &&
        videosOnBrand === 0 &&
        videosOnProducts === 0 &&
        products.length === 14,
    };
  }

  const pcmidiPersonas = pcmidi
    ? await prisma.persona.findMany({ where: { clientId: pcmidi.id } })
    : [];
  const personaToneDrift = pcmidiPersonas.map((persona) => ({
    name: persona.name,
    currentTone: persona.tone,
    seedTone: PCMIDI_SEED_PERSONA_TONES[persona.name] ?? null,
    matchesSeed: PCMIDI_SEED_PERSONA_TONES[persona.name] === persona.tone,
    updatedAt: persona.updatedAt,
  }));

  const clientDrift = pcmidi
    ? {
        currentDescription: pcmidi.description,
        seedDescription: PCMIDI_SEED_DESCRIPTION,
        matchesSeedDescription: pcmidi.description === PCMIDI_SEED_DESCRIPTION,
        currentDomainKeywords: pcmidi.domainKeywords,
        responsePolicy: pcmidi.responsePolicy,
        updatedAt: pcmidi.updatedAt,
      }
    : null;

  const recentLogs = await prisma.systemLog.findMany({
    where: { event: { contains: "onboarding" } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const report = writeReport("audit-onboarding-contamination", {
    command: "audit-onboarding-contamination",
    onboardings: onboardings.map((item: any) => ({
      clientSlug: item.client?.slug,
      sourceUrl: item.sourceUrl,
      status: item.status,
      currentStep: item.currentStep,
      updatedAt: item.updatedAt,
      completedAt: item.completedAt,
      analysisError: item.analysisError,
    })),
    pcmidi_brands: pcmidiBrands.map((brand) => ({ id: brand.id, name: brand.name, createdAt: brand.createdAt, updatedAt: brand.updatedAt })),
    contaminated_brand: contaminatedBrandDetail,
    pcmidi_client_drift: clientDrift,
    pcmidi_persona_tone_drift: personaToneDrift,
    onboarding_related_system_logs: recentLogs,
  });

  console.log(`Auditoría escrita en: ${report}`);
  if (contaminatedBrandDetail)
    console.log(
      `Marca contaminada '${CONTAMINATED_BRAND_NAME}': ${contaminatedBrandDetail.productCount} productos, safeToDelete=${contaminatedBrandDetail.safeToDelete}`,
    );
  else console.log(`No se encontró la marca '${CONTAMINATED_BRAND_NAME}' en PC MIDI.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
