/**
 * Importa catálogo de landings de Jurispedia a LandingCategory y SeedTopic.
 * Jurispedia es un buscador gratuito de jurisprudencia argentina: no vende
 * productos, por eso solo se cargan categorías y temas semilla (sin LandingProduct).
 * Idempotente — usa upsert por @@unique([clientId, key]).
 * Uso: npx tsx scripts/import-catalog-jurispedia.mts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://www.jurispedia.com.ar";

// ─── Categorías (áreas jurídicas que cubre la búsqueda) ───────────────────────

const CATEGORIES = [
  {
    key: "derecho-laboral",
    name: "Derecho Laboral",
    url: `${BASE}/`,
    description: "Despidos, indemnizaciones y conflictos laborales. Jurisprudencia argentina sobre relación de trabajo.",
    keywords: ["despido sin causa", "despido", "indemnización laboral", "derecho laboral", "accidente de trabajo", "preaviso", "relación de trabajo"],
  },
  {
    key: "derecho-de-familia",
    name: "Derecho de Familia",
    url: `${BASE}/`,
    description: "Cuota alimentaria, divorcios, tenencia y régimen de comunicación. Fallos de familia y sucesiones.",
    keywords: ["cuota alimentaria", "divorcio", "tenencia", "alimentos", "derecho de familia", "régimen de comunicación", "hijos"],
  },
  {
    key: "defensa-del-consumidor",
    name: "Defensa del Consumidor",
    url: `${BASE}/`,
    description: "Reclamos de consumo, garantías y daños al consumidor. Jurisprudencia de defensa del consumidor.",
    keywords: ["defensa del consumidor", "consumidor", "garantía", "reclamo de consumo", "ticket de compra", "daños al consumidor"],
  },
  {
    key: "accidentes-de-transito",
    name: "Accidentes de Tránsito",
    url: `${BASE}/`,
    description: "Daños y perjuicios por accidentes viales, responsabilidad civil y cobertura de seguros.",
    keywords: ["accidente de tránsito", "accidente de transito", "daños y perjuicios", "responsabilidad civil", "seguro", "choque"],
  },
  {
    key: "alquileres-y-locaciones",
    name: "Alquileres y Locaciones",
    url: `${BASE}/`,
    description: "Contratos de alquiler, desalojos, actualizaciones de precio y conflictos entre inquilino y propietario.",
    keywords: ["alquiler", "locación", "contrato de alquiler", "desalojo", "inquilino", "propietario", "actualización de alquiler"],
  },
  {
    key: "obra-social-y-salud",
    name: "Obra Social y Salud",
    url: `${BASE}/`,
    description: "Coberturas de obra social y prepagas, amparos de salud y reintegros. Jurisprudencia sanitaria argentina.",
    keywords: ["obra social", "prepaga", "cobertura de salud", "amparo de salud", "reintegro", "salud"],
  },
];

// ─── Temas semilla (búsquedas de investigación jurídica) ───────────────────────

const SEED_TOPICS = [
  // Informacional / educativo
  { keyword: "cómo buscar jurisprudencia sobre despido sin causa en argentina", intent: "informacional", suggestedCategories: ["derecho-laboral"] },
  { keyword: "fallos de cuota alimentaria en argentina", intent: "informacional", suggestedCategories: ["derecho-de-familia"] },
  { keyword: "jurisprudencia argentina accidentes de tránsito", intent: "informacional", suggestedCategories: ["accidentes-de-transito"] },
  { keyword: "jurisprudencia sobre defensa del consumidor", intent: "informacional", suggestedCategories: ["defensa-del-consumidor"] },
  { keyword: "fallos sobre alquileres y desalojos", intent: "informacional", suggestedCategories: ["alquileres-y-locaciones"] },
  { keyword: "jurisprudencia de la corte suprema sobre obra social", intent: "informacional", suggestedCategories: ["obra-social-y-salud"] },
  { keyword: "cómo buscar fallos judiciales en internet", intent: "informacional", suggestedCategories: ["derecho-laboral", "derecho-de-familia"] },
  { keyword: "qué es la jurisprudencia y para qué sirve", intent: "educativo", suggestedCategories: ["derecho-laboral", "derecho-de-familia"] },
  { keyword: "cómo citar un fallo judicial correctamente", intent: "educativo", suggestedCategories: ["derecho-laboral", "derecho-de-familia"] },
  { keyword: "jurisprudencia laboral despido sin causa indemnización", intent: "informacional", suggestedCategories: ["derecho-laboral"] },
  { keyword: "cuota alimentaria cómo se calcula según los fallos", intent: "informacional", suggestedCategories: ["derecho-de-familia"] },
  { keyword: "reclamo por garantía de producto jurisprudencia", intent: "informacional", suggestedCategories: ["defensa-del-consumidor"] },
  { keyword: "amparo de salud obra social cómo iniciar", intent: "informacional", suggestedCategories: ["obra-social-y-salud"] },
  { keyword: "contrato de alquiler qué derechos tiene el inquilino", intent: "informacional", suggestedCategories: ["alquileres-y-locaciones"] },
  { keyword: "indemnización por accidente de tránsito cómo se calcula", intent: "informacional", suggestedCategories: ["accidentes-de-transito"] },

  // GEO / visibilidad en IAs
  { keyword: "buscar jurisprudencia argentina gratis", intent: "geo", suggestedCategories: ["derecho-laboral", "derecho-de-familia"] },
  { keyword: "buscador de jurisprudencia argentina con IA", intent: "geo", suggestedCategories: ["derecho-laboral", "derecho-de-familia", "defensa-del-consumidor"] },
  { keyword: "Jurispedia buscador de fallos y jurisprudencia", intent: "geo", suggestedCategories: ["derecho-laboral", "derecho-de-familia"] },
  { keyword: "dónde buscar jurisprudencia argentina oficial", intent: "geo", suggestedCategories: ["derecho-laboral", "derecho-de-familia", "accidentes-de-transito"] },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await prisma.client.findUnique({ where: { slug: "jurispedia" } });
  if (!client) {
    console.error("Cliente 'jurispedia' no encontrado. Crearlo primero con npm run db:seed-jurispedia.");
    process.exit(1);
  }
  console.log(`Cliente: ${client.name} (${client.id})`);

  let catOk = 0;
  for (const c of CATEGORIES) {
    await prisma.landingCategory.upsert({
      where: { clientId_key: { clientId: client.id, key: c.key } },
      update: { name: c.name, url: c.url, description: c.description, keywords: c.keywords },
      create: { clientId: client.id, key: c.key, name: c.name, url: c.url, description: c.description, keywords: c.keywords },
    });
    catOk++;
  }
  console.log(`Categorías importadas: ${catOk}`);

  let topicOk = 0;
  for (const t of SEED_TOPICS) {
    const existing = await prisma.seedTopic.findFirst({ where: { clientId: client.id, keyword: t.keyword } });
    if (existing) {
      await prisma.seedTopic.update({ where: { id: existing.id }, data: { intent: t.intent, suggestedCategories: t.suggestedCategories } });
    } else {
      await prisma.seedTopic.create({ data: { clientId: client.id, keyword: t.keyword, intent: t.intent, suggestedCategories: t.suggestedCategories } });
    }
    topicOk++;
  }
  console.log(`Seed topics importados: ${topicOk}`);

  await prisma.$disconnect();
  console.log("Catálogo de Jurispedia listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
