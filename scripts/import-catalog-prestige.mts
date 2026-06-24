/**
 * Importa catálogo de Prestige Running a LandingCategory, LandingProduct y SeedTopic.
 * Uso: npx tsx scripts/import-catalog-prestige.mts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "https://www.prestigemedias.com.ar";

// ─── Categorías ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    key: "soquetes-cortos",
    name: "Soquetes Cortos",
    url: `${BASE}/lower/`,
    description: "Medias deportivas cortas por debajo del tobillo, ideales para running y entrenamiento en climas cálidos.",
    keywords: ["soquete corto", "medias cortas running", "medias tobilleras deportivas", "low cut running socks"],
  },
  {
    key: "cuarto-de-cana",
    name: "Cuarto de Caña",
    url: `${BASE}/quarter/`,
    description: "Medias deportivas que cubren el tobillo hasta unos centímetros por encima. Muy populares en running y trail.",
    keywords: ["cuarto de caña", "quarter sock", "medias running tobillo", "medias deportivas quarter"],
  },
  {
    key: "media-cana",
    name: "Media Caña",
    url: `${BASE}/middle/`,
    description: "Medias que cubren hasta la mitad de la pantorrilla. Protegen del rozamiento en trail y cross training.",
    keywords: ["media caña", "mid calf sock", "medias running media pierna", "medias trail media caña"],
  },
  {
    key: "largas",
    name: "Largas",
    url: `${BASE}/longer/`,
    description: "Medias que cubren hasta la rodilla. Incluyen modelos de compresión graduada para running y recuperación.",
    keywords: ["medias largas running", "medias hasta la rodilla", "medias compresión running", "knee high running socks"],
  },
  {
    key: "pantorrillera",
    name: "Pantorrilleras",
    url: `${BASE}/pantorrillera/`,
    description: "Pantorrilleras de compresión graduada para running, ciclismo y recuperación muscular.",
    keywords: ["pantorrillera running", "calf sleeve compresión", "pantorrillera deportiva", "compresión graduada pantorrilla"],
  },
  {
    key: "compresion-graduada",
    name: "Compresión Graduada",
    url: `${BASE}/compresion-graduada/`,
    description: "Medias y pantorrilleras con compresión graduada 15-20 mmHg. Indicadas para running, viajes largos y recuperación.",
    keywords: ["compresión graduada", "medias compresión 15-20 mmhg", "medias circulación", "medias running compresión"],
  },
  {
    key: "trail",
    name: "Trail Running",
    url: `${BASE}/trail/`,
    description: "Medias técnicas específicas para trail running. Mayor acolchado, protección y grip en terrenos irregulares.",
    keywords: ["medias trail running", "trail socks", "medias montaña running", "medias técnicas trail"],
  },
  {
    key: "medias-tecnicas",
    name: "Medias Técnicas Running",
    url: `${BASE}/medias-tecnicas-running/`,
    description: "Línea técnica con materiales como microfibra dry y diseños ergonómicos para running, trail y gimnasio.",
    keywords: ["medias técnicas running", "running socks técnicos", "microfibra dry running", "medias ergonómicas deportivas"],
  },
  {
    key: "termicas",
    name: "Térmicas",
    url: `${BASE}/termicas1/`,
    description: "Medias térmicas para correr en frío. Retienen el calor y mantienen el pie cómodo en invierno.",
    keywords: ["medias térmicas running", "medias frío deporte", "thermal running socks", "medias invierno deportivas"],
  },
  {
    key: "invisibles",
    name: "Invisibles",
    url: `${BASE}/invisibles/`,
    description: "Medias invisibles o liner, se usan debajo del zapato sin que asomen. Talles M y L.",
    keywords: ["medias invisibles", "no show socks", "liner running", "medias ocultas zapatillas"],
  },
  {
    key: "tripack",
    name: "Tripack",
    url: `${BASE}/tripack/`,
    description: "Pack de 3 pares de medias deportivas. Mejor precio por unidad para equiparte bien.",
    keywords: ["tripack medias", "pack 3 medias running", "combo medias deportivas", "3 pares medias running"],
  },
  {
    key: "bipack",
    name: "Bipack",
    url: `${BASE}/bipack/`,
    description: "Pack de 2 pares de medias deportivas Prestige Running.",
    keywords: ["bipack medias", "pack 2 medias running", "combo 2 pares medias"],
  },
  {
    key: "futbol",
    name: "Fútbol",
    url: `${BASE}/middle/`,
    description: "Medias de fútbol con antideslizante y pantorrillera integrada. Media caña técnica para cancha.",
    keywords: ["medias fútbol", "medias futbol antideslizante", "calcetas fútbol", "medias grip fútbol"],
  },
];

// ─── Productos ─────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // Soquetes Cortos
  { externalId: "1060", name: "Soquete Corto 1060", categoryKey: "soquetes-cortos", url: `${BASE}/productos/soquete-corto-1060/`, useText: "Soquete corto running básico, bajo el tobillo." },
  { externalId: "1065", name: "Soquete Corto 1065", categoryKey: "soquetes-cortos", url: `${BASE}/productos/soquete-corto-1065/`, useText: "Soquete corto running con diseño de color." },
  { externalId: "1030", name: "Soquete Spry con talonera Art 1030", categoryKey: "soquetes-cortos", url: `${BASE}/productos/spry1030/`, useText: "Soquete corto con talonera reforzada para mayor sujeción." },
  { externalId: "2555", name: "Pack x3 Tech Basic con refuerzo Art 2555", categoryKey: "soquetes-cortos", url: `${BASE}/productos/techbasicx3/`, useText: "Tripack de soquetes con refuerzo en planta y talón." },

  // Cuarto de Caña
  { externalId: "1070", name: "Cuarto de Caña InMyself Art 1070", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/1070inmyself/`, useText: "Cuarto de caña con diseño ergonómico y compresión suave." },
  { externalId: "1075", name: "Cuarto de Caña 1075", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/cuarto-de-cana-1075-negro/`, useText: "Cuarto de caña clásico negro para running urbano." },
  { externalId: "1018", name: "Free While Quarter Tech Design Art 1018", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/freewhilequarter/`, useText: "Soquete quarter técnico de running-trail en microfibra." },
  { externalId: "1020", name: "Trail Pro Quarter Art 1020", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/trailproquarter/`, useText: "Quarter técnico para trail, acolchado en zonas de impacto." },
  { externalId: "685", name: "Bipack Soquete Quarter Art 685", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/bipack-soquete-quarter/`, useText: "Pack de 2 pares de quarter para entrenamiento regular." },
  { externalId: "5358", name: "Tripack Media Toalla Cuarto de Caña Art 5358", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/tripackmediatoalla/`, useText: "Tripack con interior de media toalla para más absorción." },
  { externalId: "1685", name: "Tripack Quarter MultiSurface Art 1685", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/tripackmultisurface/`, useText: "Tripack quarter técnico para múltiples superficies." },
  { externalId: "2507", name: "Tripack Quarter X Microfibra Art 2507", categoryKey: "cuarto-de-cana", url: `${BASE}/productos/tripack-quarter-x/`, useText: "Tripack técnico en microfibra, quarter de alto rendimiento." },

  // Media Caña
  { externalId: "1025", name: "Trail Pro Media Caña Art 1025", categoryKey: "media-cana", url: `${BASE}/productos/trailpromidcalf/`, useText: "Media caña técnica para trail con acolchado zonal." },
  { externalId: "1015", name: "Long Battle Microfibra Dry Media Caña Art 1015", categoryKey: "media-cana", url: `${BASE}/productos/longbattlerundry/`, useText: "Media caña en microfibra Dry para correr en calor." },
  { externalId: "1022", name: "Core Run-Tech Design Media Caña Art 1022", categoryKey: "media-cana", url: `${BASE}/productos/freewhilemid/`, useText: "Media caña técnica con diseño ergonómico para running." },
  { externalId: "1090", name: "Media Caña 1090", categoryKey: "media-cana", url: `${BASE}/middle/`, useText: "Media caña deportiva en colores rosa, amarillo y verde." },
  { externalId: "1125", name: "Media de Fútbol con Antideslizante Art 1125", categoryKey: "futbol", url: `${BASE}/productos/medias-futbol-c-antideslizante/`, useText: "Media de fútbol media caña con grip antideslizante." },

  // Largas
  { externalId: "1080", name: "Largas 1080", categoryKey: "largas", url: `${BASE}/productos/largas-1080-negro-verde/`, useText: "Media larga running hasta la rodilla, varios colores." },
  { externalId: "1085", name: "Elite Compression Art 1085", categoryKey: "largas", url: `${BASE}/productos/largas-1085-negro-gris/`, useText: "Media larga running con compresión graduada, negro/gris." },
  { externalId: "1040", name: "Largas Art 1040", categoryKey: "largas", url: `${BASE}/productos/largas-azul-c-naranja-art-1040/`, useText: "Media larga running de alto rendimiento, varios colores." },
  { externalId: "1010", name: "Compresión Graduada 15-20 mmHg Art 1010", categoryKey: "compresion-graduada", url: `${BASE}/productos/largas-1010/`, useText: "Media larga de compresión graduada 15-20 mmHg para running y recuperación." },

  // Pantorrilleras
  { externalId: "2080", name: "Pantorrillera One Step a Day Art 2080", categoryKey: "pantorrillera", url: `${BASE}/productos/pantorrilleraonestepaday/`, useText: "Pantorrillera compresión graduada 15-20 mmHg para running diario." },
  { externalId: "2081", name: "Pantorrillera Compresión Graduada Art 2081", categoryKey: "pantorrillera", url: `${BASE}/productos/pantorrillera-2081/`, useText: "Pantorrillera compresión graduada 15-20 mmHg, entrada económica." },
  { externalId: "1129", name: "Media Fútbol + Pantorrillera Art 1129", categoryKey: "futbol", url: `${BASE}/productos/medias-futbol-c-antideslizante-pantorrillera/`, useText: "Pack media de fútbol con antideslizante + pantorrillera de compresión." },

  // Compresión / Viaje
  { externalId: "1620", name: "Medias de Descanso-Viajeros Compresión Graduada Art 1620", categoryKey: "compresion-graduada", url: `${BASE}/productos/mediasdescansotravel/`, useText: "Media de compresión graduada para viajes largos y reposo prolongado." },

  // Trail
  // (1020 y 1025 ya listados en sus categorías)

  // Térmicas
  { externalId: "4040", name: "Thermal Dragon Art 4040", categoryKey: "termicas", url: `${BASE}/productos/thermaldragon/`, useText: "Media térmica para correr en frío, retiene el calor." },
  { externalId: "termica-negro", name: "Media Térmica Negro", categoryKey: "termicas", url: `${BASE}/productos/media-termica-negro/`, useText: "Media térmica negra para entrenamiento en invierno." },
  { externalId: "termica-gris", name: "Media Térmica Gris", categoryKey: "termicas", url: `${BASE}/productos/media-termica-gris/`, useText: "Media térmica gris para entrenamiento en invierno." },

  // Invisibles
  { externalId: "2505", name: "Tripack Invisibles Jaspeadas Art 2505", categoryKey: "invisibles", url: `${BASE}/productos/tripack-invisibles-jaspeadas/`, useText: "Pack de 3 medias invisibles jaspeadas, no asoman al calzado." },
  { externalId: "2501", name: "Tripack Invisibles Flúo Art 2501", categoryKey: "invisibles", url: `${BASE}/productos/tripack-invisibles-fluo/`, useText: "Pack de 3 medias invisibles en colores flúo." },

  // Tripack
  { externalId: "2510", name: "Tripack Limber Soquetes Cortos Art 2510", categoryKey: "tripack", url: `${BASE}/productos/tripacklimber2510/`, useText: "Tripack de soquetes cortos running Limber, cómodos y livianos." },
  { externalId: "1630", name: "Tripack Lite Ergonomic con Talonera Art 1630", categoryKey: "tripack", url: `${BASE}/productos/triapackliteergonomic/`, useText: "Tripack ergonómico con talonera reforzada para running técnico." },
];

// ─── Seed Topics (geo_prompts) ─────────────────────────────────────────────────

const SEED_TOPICS = [
  // Compras / recomendaciones
  { keyword: "qué medias usar para correr", intent: "compra", suggestedCategories: ["medias-tecnicas", "soquetes-cortos", "cuarto-de-cana"] },
  { keyword: "mejores medias para running en Argentina", intent: "compra", suggestedCategories: ["medias-tecnicas", "largas", "cuarto-de-cana"] },
  { keyword: "medias deportivas para maratón", intent: "compra", suggestedCategories: ["largas", "compresion-graduada", "medias-tecnicas"] },
  { keyword: "medias con compresión para correr", intent: "compra", suggestedCategories: ["compresion-graduada", "largas", "pantorrillera"] },
  { keyword: "qué media usar para trail running", intent: "compra", suggestedCategories: ["trail", "medias-tecnicas", "media-cana"] },
  { keyword: "medias para correr en invierno", intent: "compra", suggestedCategories: ["termicas", "media-cana", "largas"] },
  { keyword: "pantorrillera de compresión para running", intent: "compra", suggestedCategories: ["pantorrillera", "compresion-graduada"] },
  { keyword: "medias running baratas Argentina", intent: "compra", suggestedCategories: ["tripack", "bipack", "soquetes-cortos"] },
  { keyword: "combo medias running", intent: "compra", suggestedCategories: ["tripack", "bipack"] },
  { keyword: "medias running talles grandes", intent: "compra", suggestedCategories: ["medias-tecnicas", "soquetes-cortos", "cuarto-de-cana"] },

  // Informacional / educativo
  { keyword: "diferencia entre soquete y cuarto de caña en running", intent: "informacional", suggestedCategories: ["soquetes-cortos", "cuarto-de-cana"] },
  { keyword: "qué tipo de media elegir para correr", intent: "informacional", suggestedCategories: ["medias-tecnicas", "soquetes-cortos", "cuarto-de-cana", "largas"] },
  { keyword: "para qué sirve la compresión graduada en running", intent: "informacional", suggestedCategories: ["compresion-graduada", "pantorrillera", "largas"] },
  { keyword: "media larga vs soquete corto running", intent: "informacional", suggestedCategories: ["largas", "soquetes-cortos"] },
  { keyword: "medias técnicas running vs algodón", intent: "informacional", suggestedCategories: ["medias-tecnicas"] },
  { keyword: "cómo evitar ampollas corriendo", intent: "informacional", suggestedCategories: ["medias-tecnicas", "soquetes-cortos", "cuarto-de-cana"] },
  { keyword: "beneficios de las medias de compresión para runners", intent: "informacional", suggestedCategories: ["compresion-graduada", "pantorrillera", "largas"] },
  { keyword: "qué son las medias de trail running", intent: "informacional", suggestedCategories: ["trail", "medias-tecnicas"] },
  { keyword: "medias térmicas para correr en frío", intent: "informacional", suggestedCategories: ["termicas"] },
  { keyword: "cuándo usar pantorrillera de compresión en running", intent: "informacional", suggestedCategories: ["pantorrillera", "compresion-graduada"] },
  { keyword: "medias running microfibra ventajas", intent: "informacional", suggestedCategories: ["medias-tecnicas", "trail"] },
  { keyword: "talle de medias running M L como elegir", intent: "informacional", suggestedCategories: ["medias-tecnicas", "soquetes-cortos"] },

  // GEO / visibilidad en IAs
  { keyword: "tienda de medias running en Argentina", intent: "geo", suggestedCategories: ["medias-tecnicas", "soquetes-cortos", "largas"] },
  { keyword: "Prestige Running medias", intent: "geo", suggestedCategories: ["medias-tecnicas", "tripack", "compresion-graduada"] },
  { keyword: "dónde comprar medias deportivas técnicas en Argentina", intent: "geo", suggestedCategories: ["medias-tecnicas", "cuarto-de-cana", "largas"] },
  { keyword: "medias running marca argentina", intent: "geo", suggestedCategories: ["medias-tecnicas", "largas", "tripack"] },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await prisma.client.findUnique({
    where: { slug: "prestige-running" },
    select: { id: true, name: true },
  });
  if (!client) {
    console.error("Cliente 'prestige-running' no encontrado. Crearlo primero en /clients.");
    process.exit(1);
  }
  console.log(`Cliente: ${client.name} (${client.id})`);

  // Categorías
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

  // Productos
  let prodOk = 0;
  for (const p of PRODUCTS) {
    await prisma.landingProduct.upsert({
      where: { clientId_externalId: { clientId: client.id, externalId: p.externalId } },
      update: { name: p.name, brand: "Prestige Running", categoryKey: p.categoryKey, url: p.url, useText: p.useText },
      create: { clientId: client.id, externalId: p.externalId, name: p.name, brand: "Prestige Running", categoryKey: p.categoryKey, url: p.url, useText: p.useText },
    });
    prodOk++;
  }
  console.log(`Productos importados: ${prodOk}`);

  // Seed topics
  let topicOk = 0;
  for (const t of SEED_TOPICS) {
    const existing = await prisma.seedTopic.findFirst({
      where: { clientId: client.id, keyword: t.keyword },
    });
    if (existing) {
      await prisma.seedTopic.update({
        where: { id: existing.id },
        data: { intent: t.intent, suggestedCategories: t.suggestedCategories },
      });
    } else {
      await prisma.seedTopic.create({
        data: { clientId: client.id, keyword: t.keyword, intent: t.intent, suggestedCategories: t.suggestedCategories },
      });
    }
    topicOk++;
  }
  console.log(`Seed topics importados: ${topicOk}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
