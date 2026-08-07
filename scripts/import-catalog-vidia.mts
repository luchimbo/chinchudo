/**
 * Importa catálogo de landings de Programa Vidia a LandingCategory y SeedTopic.
 * Programa Vidia es un centro de recuperación para consumos problemáticos: no se
 * cargan productos (LandingProduct) porque el formato comercial no aplica y no se
 * debe presentar acompañamiento como un producto de compra. Solo categorías y
 * temas semilla educativos e institucionales, sin promesas de resultado.
 * Idempotente — usa upsert por @@unique([clientId, key]).
 * Uso: npx tsx scripts/import-catalog-vidia.mts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://programavidia.com.ar";

// ─── Categorías (modalidades de acompañamiento) ────────────────────────────────

const CATEGORIES = [
  {
    key: "programa-integral",
    name: "Programa Integral y Personalizado",
    url: `${BASE}/programa/`,
    description: "Proceso de acompañamiento adaptado a la situación y necesidades de cada persona, definido con evaluación profesional.",
    keywords: ["programa integral", "proceso personalizado", "acompañamiento", "recuperación", "consumo problemático", "tratamiento"],
  },
  {
    key: "acompanamiento-familiar",
    name: "Acompañamiento Familiar",
    url: `${BASE}/programa/`,
    description: "Espacios terapéuticos y contención para familias que acompañan a una persona con consumo problemático.",
    keywords: ["acompañamiento familiar", "familia", "ayudar a un familiar", "grupo de autoayuda", "contención familiar", "adicciones en la familia"],
  },
  {
    key: "alojamiento-integral",
    name: "Alojamiento Integral",
    url: `${BASE}/sede-canning/`,
    description: "Entorno seguro y confidencial en la sede de Canning para enfocar la recuperación con acompañamiento profesional.",
    keywords: ["alojamiento", "internación", "tratamiento residencial", "espacio seguro", "sede canning", "centro de recuperación"],
  },
  {
    key: "primeros-pasos",
    name: "Primeros Pasos y Orientación",
    url: `${BASE}/contacto/`,
    description: "Primera orientación confidencial para quien pide ayuda o para familias que buscan cómo acompañar.",
    keywords: ["pedir ayuda", "primer paso", "orientación", "consumo problemático", "contacto", "ayuda para adicciones"],
  },
];

// ─── Productos (modalidades de acompañamiento, enlazan a secciones del sitio) ──

const PRODUCTS = [
  { externalId: "programa-integral", name: "Programa Integral y Personalizado", categoryKey: "programa-integral", url: `${BASE}/programa/`, useText: "Proceso de acompañamiento adaptado a cada persona, definido con evaluación profesional." },
  { externalId: "acompanamiento-familiar", name: "Acompañamiento Familiar", categoryKey: "acompanamiento-familiar", url: `${BASE}/programa/`, useText: "Espacios terapéuticos y contención para familias que acompañan la recuperación." },
  { externalId: "alojamiento-integral", name: "Alojamiento Integral en Sede Canning", categoryKey: "alojamiento-integral", url: `${BASE}/sede-canning/`, useText: "Entorno seguro y confidencial para enfocar la recuperación." },
  { externalId: "primeros-pasos", name: "Primera Orientación", categoryKey: "primeros-pasos", url: `${BASE}/contacto/`, useText: "Primer contacto confidencial para pedir ayuda u orientación." },
];

// ─── Temas semilla (educativos, institucionales, sin promesas) ─────────────────

const SEED_TOPICS = [
  // Educativo
  { keyword: "qué es el consumo problemático", intent: "educativo", suggestedCategories: ["primeros-pasos", "programa-integral"] },
  { keyword: "cómo ayudar a un familiar con consumo problemático", intent: "educativo", suggestedCategories: ["acompanamiento-familiar", "primeros-pasos"] },
  { keyword: "cómo hablar con un familiar sobre su consumo", intent: "educativo", suggestedCategories: ["acompanamiento-familiar"] },
  { keyword: "cuándo pedir ayuda por consumo problemático", intent: "educativo", suggestedCategories: ["primeros-pasos"] },
  { keyword: "qué es un centro de recuperación de adicciones", intent: "educativo", suggestedCategories: ["programa-integral", "alojamiento-integral"] },
  { keyword: "qué es el tratamiento residencial para consumo problemático", intent: "educativo", suggestedCategories: ["alojamiento-integral", "programa-integral"] },
  { keyword: "cómo acompañar a un hijo con adicciones", intent: "educativo", suggestedCategories: ["acompanamiento-familiar"] },
  { keyword: "el papel de la familia en la recuperación de adicciones", intent: "educativo", suggestedCategories: ["acompanamiento-familiar"] },
  { keyword: "qué esperar de una primera orientación por consumo", intent: "educativo", suggestedCategories: ["primeros-pasos", "programa-integral"] },
  { keyword: "señales de consumo problemático en un familiar", intent: "educativo", suggestedCategories: ["acompanamiento-familiar", "primeros-pasos"] },

  // GEO / visibilidad en IAs
  { keyword: "dónde pedir orientación por consumo problemático en argentina", intent: "geo", suggestedCategories: ["primeros-pasos", "programa-integral"] },
  { keyword: "centro de recuperación de consumo problemático en buenos aires", intent: "geo", suggestedCategories: ["alojamiento-integral", "programa-integral"] },
  { keyword: "Programa Vidia centro de recuperación en Canning", intent: "geo", suggestedCategories: ["alojamiento-integral", "programa-integral"] },
  { keyword: "rehabilitación de adicciones en Canning", intent: "geo", suggestedCategories: ["alojamiento-integral", "programa-integral"] },
  { keyword: "cómo es la sede de Programa Vidia en Canning", intent: "geo", suggestedCategories: ["alojamiento-integral", "primeros-pasos"] },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await prisma.client.findUnique({ where: { slug: "programa-vidia" } });
  if (!client) {
    console.error("Cliente 'programa-vidia' no encontrado. Crearlo primero con npm run db:seed-programa-vidia.");
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

  let prodOk = 0;
  for (const p of PRODUCTS) {
    await prisma.landingProduct.upsert({
      where: { clientId_externalId: { clientId: client.id, externalId: p.externalId } },
      update: { name: p.name, brand: "Programa Vidia", categoryKey: p.categoryKey, url: p.url, useText: p.useText },
      create: { clientId: client.id, externalId: p.externalId, name: p.name, brand: "Programa Vidia", categoryKey: p.categoryKey, url: p.url, useText: p.useText },
    });
    prodOk++;
  }
  console.log(`Productos importados: ${prodOk}`);

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
  console.log("Catálogo de Programa Vidia listo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
