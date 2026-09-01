// Revierte la contaminación cruzada: PC MIDI quedó con una marca, 14 productos
// y un onboarding importados de prestigemedias.com.ar, y su descripción,
// domainKeywords y el tono de sus 5 personas fueron sobrescritos por el
// autosave del onboarding antes de que analyze/PATCH quedaran aislados del
// catálogo y la configuración confirmada.
//
// Por defecto corre en modo --dry-run (sólo reporta). Usar --apply para escribir.
import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport } from "./agent-utils.mjs";
import {
  analyzePublicWebsite,
  parseDomainKeywords,
  sanitizeDraft,
  type ConfirmedClientContext,
} from "../src/lib/onboarding";

loadEnv();
const prisma = new PrismaClient();
const onboardingDb = prisma as any;

const CONTAMINATED_BRAND_NAME = "Tienda Online de Prestige Running";
const PCMIDI_SLUG = "pcmidi";
const PRESTIGE_SLUG = "prestige-running";
const PRESTIGE_SOURCE_URL = "https://prestigemedias.com.ar";
const EXPECTED_CONTAMINATED_PRODUCT_COUNT = 14;

const PCMIDI_DESCRIPTION =
  "Instrumentos musicales, controladores MIDI, interfaces de audio, baterias electronicas y home studio.";
const PCMIDI_DOMAIN_KEYWORDS = [
  "midiplus",
  "kressmer",
  "controlador midi",
  "interfaz de audio",
  "bateria electronica",
  "home studio",
  "daw",
  "piano digital",
  "teclado musical",
  "produccion musical",
  "auriculares estudio",
];

const PCMIDI_PERSONAS: Record<string, { tone: string; goals: string; allowedPhrases: string; forbiddenPhrases: string }> = {
  "Técnico": {
    tone: "Preciso, practico y sin vender de mas.",
    goals: "Traducir especificaciones a beneficios reales y aclarar limites tecnicos.",
    allowedPhrases: "",
    forbiddenPhrases: "",
  },
  "Práctico": {
    tone: "Cotidiano, cercano y concreto.",
    goals: "Ayudar a elegir pensando en vecinos, silencio y rebote.",
    allowedPhrases: "",
    forbiddenPhrases: "",
  },
  "Innovación": {
    tone: "Moderno, curioso y aspiracional, sin exagerar datos.",
    goals: "Mostrar Kressmer como opcion distinta y deseable.",
    allowedPhrases: "",
    forbiddenPhrases: "",
  },
  "Educativo": {
    tone: "Didactico, criterioso y simple.",
    goals: "Orientar a alumnos, padres y escuelas hacia compras seguras.",
    allowedPhrases: "",
    forbiddenPhrases: "",
  },
  "Comercial": {
    tone: "Directo, entusiasta y practico.",
    goals: "Destacar conveniencia y facilidad de compra sin claims falsos.",
    allowedPhrases: "",
    forbiddenPhrases: "",
  },
};

function parseArgs() {
  return {
    apply: process.argv.includes("--apply") || process.env.npm_config_apply === "true",
  };
}

async function main() {
  const args = parseArgs();
  const before: Record<string, unknown> = {};
  const errors: string[] = [];

  const pcmidi = await prisma.client.findUnique({ where: { slug: PCMIDI_SLUG } });
  const prestige = await prisma.client.findUnique({ where: { slug: PRESTIGE_SLUG } });
  if (!pcmidi) errors.push(`Cliente '${PCMIDI_SLUG}' no encontrado.`);
  if (!prestige) errors.push(`Cliente '${PRESTIGE_SLUG}' no encontrado.`);

  const contaminatedBrand = pcmidi
    ? await prisma.brand.findUnique({ where: { clientId_name: { clientId: pcmidi.id, name: CONTAMINATED_BRAND_NAME } } })
    : null;
  if (!contaminatedBrand) errors.push(`Marca '${CONTAMINATED_BRAND_NAME}' no encontrada en PC MIDI. Nada que reparar.`);

  const pcmidiOnboarding = pcmidi
    ? await onboardingDb.clientOnboarding.findUnique({ where: { clientId: pcmidi.id } })
    : null;

  let products: { id: string; name: string }[] = [];
  if (contaminatedBrand) {
    products = await prisma.product.findMany({ where: { brandId: contaminatedBrand.id }, select: { id: true, name: true } });
    before.contaminated_brand = { id: contaminatedBrand.id, name: contaminatedBrand.name, productCount: products.length };

    // Precondición 1: exactamente 14 productos web.
    if (products.length !== EXPECTED_CONTAMINATED_PRODUCT_COUNT) {
      errors.push(
        `La marca contaminada tiene ${products.length} productos, se esperaban ${EXPECTED_CONTAMINATED_PRODUCT_COUNT}. Abortando.`,
      );
    }

    // Precondición 2: ninguna relación operativa.
    const productIds = products.map((product) => product.id);
    const opportunitiesOnProducts = productIds.length
      ? await prisma.opportunity.count({ where: { detectedProductId: { in: productIds } } })
      : 0;
    const opportunitiesOnBrand = await prisma.opportunity.count({ where: { detectedBrandId: contaminatedBrand.id } });
    const responsesOnBrand = await prisma.response.count({ where: { brandId: contaminatedBrand.id } });
    const videosOnBrand = await prisma.videoScript.count({ where: { brandId: contaminatedBrand.id } });
    const videosOnProducts = productIds.length
      ? await prisma.videoScript.count({ where: { productId: { in: productIds } } })
      : 0;
    if (opportunitiesOnProducts || opportunitiesOnBrand || responsesOnBrand || videosOnBrand || videosOnProducts) {
      errors.push(
        `La marca contaminada tiene relaciones operativas (opportunities=${opportunitiesOnProducts + opportunitiesOnBrand}, responses=${responsesOnBrand}, videos=${videosOnBrand + videosOnProducts}). Abortando.`,
      );
    }
  }

  // Precondición 3: el onboarding de PC MIDI apunta a prestigemedias.com.ar y no está COMPLETED.
  if (pcmidiOnboarding) {
    before.pcmidi_onboarding = {
      sourceUrl: pcmidiOnboarding.sourceUrl,
      status: pcmidiOnboarding.status,
    };
    if (!pcmidiOnboarding.sourceUrl.includes("prestigemedias.com.ar")) {
      errors.push(
        `El onboarding de PC MIDI apunta a '${pcmidiOnboarding.sourceUrl}', no a prestigemedias.com.ar. Abortando borrado del onboarding.`,
      );
    }
    if (pcmidiOnboarding.status === "COMPLETED") {
      errors.push("El onboarding de PC MIDI ya está COMPLETED. Abortando: revisar manualmente antes de tocarlo.");
    }
  }

  if (pcmidi) {
    before.pcmidi_client = { description: pcmidi.description, domainKeywords: pcmidi.domainKeywords, responsePolicy: pcmidi.responsePolicy };
    const personas = await prisma.persona.findMany({ where: { clientId: pcmidi.id } });
    before.pcmidi_personas = personas.map((persona) => ({ name: persona.name, tone: persona.tone }));
  }

  const preconditionsOk = errors.length === 0;

  if (!args.apply) {
    const report = writeReport("repair-prestige-contamination", {
      command: "repair-prestige-contamination",
      dry_run: true,
      preconditions_ok: preconditionsOk,
      before,
      errors,
    });
    console.log(`[dry-run] preconditions_ok=${preconditionsOk}. Reporte: ${report}`);
    if (!preconditionsOk) process.exitCode = 1;
    await prisma.$disconnect();
    return;
  }

  if (!preconditionsOk) {
    console.error("Precondiciones no cumplidas; no se aplica nada.", errors);
    await prisma.$disconnect();
    process.exit(1);
  }

  const after: Record<string, unknown> = {};

  await prisma.$transaction(async (tx) => {
    if (contaminatedBrand) {
      await tx.product.deleteMany({ where: { brandId: contaminatedBrand.id } });
      await tx.brand.delete({ where: { id: contaminatedBrand.id } });
    }
    if (pcmidiOnboarding) {
      await (tx as any).onboardingSourcePage.deleteMany({ where: { onboardingId: pcmidiOnboarding.id } });
      await (tx as any).clientOnboarding.delete({ where: { id: pcmidiOnboarding.id } });
    }
    if (pcmidi) {
      await tx.client.update({
        where: { id: pcmidi.id },
        data: {
          description: PCMIDI_DESCRIPTION,
          domainKeywords: JSON.stringify(PCMIDI_DOMAIN_KEYWORDS),
          // El seed nunca fija responsePolicy para PC MIDI: su valor previo a la
          // contaminación era el default del schema, no algo que el onboarding deba dictar.
          responsePolicy: {},
        },
      });
      for (const [name, values] of Object.entries(PCMIDI_PERSONAS)) {
        await tx.persona.updateMany({
          where: { clientId: pcmidi.id, name },
          data: { tone: values.tone, goals: values.goals },
        });
      }
    }
  });

  // Nuevo borrador de prestige-running, analizado desde el sitio real y anclado
  // a la configuración confirmada (marca Prestige, nombre, keywords). Queda en
  // IN_REVIEW: el catálogo confirmado de Prestige no se toca hasta aprobación humana.
  if (prestige) {
    const prestigeBrands = await prisma.brand.findMany({ where: { clientId: prestige.id }, select: { name: true } });
    const context: ConfirmedClientContext = {
      name: prestige.name,
      brands: prestigeBrands.map((brand) => brand.name),
      description: prestige.description,
      domainKeywords: parseDomainKeywords(prestige.domainKeywords),
      openrouterApiKey: prestige.openrouterApiKey,
      openrouterModel: prestige.openrouterModel,
    };
    try {
      const analysis = await analyzePublicWebsite(PRESTIGE_SOURCE_URL, context);
      const draft = sanitizeDraft(analysis.draft, prestige.name);
      const created = await onboardingDb.clientOnboarding.upsert({
        where: { clientId: prestige.id },
        create: { clientId: prestige.id, sourceUrl: PRESTIGE_SOURCE_URL, status: "IN_REVIEW", draft },
        update: { sourceUrl: PRESTIGE_SOURCE_URL, status: "IN_REVIEW", analysisError: "", draft },
      });
      if (analysis.pages.length) {
        await onboardingDb.onboardingSourcePage.deleteMany({ where: { onboardingId: created.id } });
        await onboardingDb.onboardingSourcePage.createMany({
          data: analysis.pages.map((page) => ({
            onboardingId: created.id,
            url: page.url,
            title: page.title,
            pageType: page.pageType,
            contentHash: page.hash,
            excerpt: page.text.slice(0, 4000),
            extracted: { offerings: page.offerings, socialNetworks: page.socialNetworks, platform: page.platform },
          })),
        });
      }
      after.prestige_onboarding = { id: created.id, sourceUrl: created.sourceUrl, status: created.status, warning: analysis.warning };
    } catch (error) {
      after.prestige_onboarding_error = error instanceof Error ? error.message : String(error);
      console.error("No se pudo analizar prestigemedias.com.ar para el nuevo borrador:", error);
    }
  }

  const pcmidiAfter = pcmidi ? await prisma.client.findUnique({ where: { id: pcmidi.id } }) : null;
  const pcmidiPersonasAfter = pcmidi ? await prisma.persona.findMany({ where: { clientId: pcmidi.id } }) : [];
  after.pcmidi_client = pcmidiAfter
    ? { description: pcmidiAfter.description, domainKeywords: pcmidiAfter.domainKeywords, responsePolicy: pcmidiAfter.responsePolicy }
    : null;
  after.pcmidi_personas = pcmidiPersonasAfter.map((persona) => ({ name: persona.name, tone: persona.tone }));
  after.pcmidi_brand_deleted = Boolean(contaminatedBrand);
  after.pcmidi_onboarding_deleted = Boolean(pcmidiOnboarding);

  const report = writeReport("repair-prestige-contamination", {
    command: "repair-prestige-contamination",
    dry_run: false,
    before,
    after,
  });
  console.log(`Reparación aplicada. Reporte: ${report}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
