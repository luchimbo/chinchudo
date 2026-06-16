/**
 * Agrega fuentes monitoreadas específicas para cada voz del quinteto.
 * Usa upsert por label para ser idempotente.
 */
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();

const NEW_SOURCES = [
  // ── Profe / Madre-Padre ──────────────────────────────────────────────────
  { label: "YouTube - aprender piano adulto",          channel: "youtube",   query: "aprender piano adulto desde cero",           limit: 5 },
  { label: "YouTube - teclado para niños clases",      channel: "youtube",   query: "teclado musical para niños clases",          limit: 5 },
  { label: "YouTube - primer teclado recomendacion",   channel: "youtube",   query: "primer teclado musical recomendacion",       limit: 5 },
  { label: "Reddit - aprender piano adulto",           channel: "reddit",    query: "aprender piano adulto principiante",         limit: 5 },
  { label: "Reddit - teclado hijo aprender",           channel: "reddit",    query: "teclado musical hijo aprender tocar",        limit: 5 },
  { label: "X - piano para aprender",                  channel: "x",         query: "piano teclado aprender tocar principiante", limit: 5 },
  { label: "Facebook - teclado para aprender musica",  channel: "facebook",  query: "teclado para aprender musica hijo clases",  limit: 5 },
  { label: "TikTok - aprender piano desde cero",       channel: "tiktok",    query: "aprender piano desde cero teclado",         limit: 5 },

  // ── Cazador de Ofertas ──────────────────────────────────────────────────
  { label: "YouTube - teclado midi barato bueno",      channel: "youtube",   query: "teclado midi economico bueno calidad precio", limit: 5 },
  { label: "YouTube - controlador midi precio",        channel: "youtube",   query: "controlador midi precio cuotas oferta",     limit: 5 },
  { label: "Reddit - teclado midi precio cuotas",      channel: "reddit",    query: "teclado midi precio cuotas financiacion",   limit: 5 },
  { label: "X - teclado midi descuento oferta",        channel: "x",         query: "teclado midi descuento oferta promo",       limit: 5 },
  { label: "Facebook - midi controller precio",        channel: "facebook",  query: "midi controller precio cuotas disponible",  limit: 5 },
  { label: "TikTok - teclado midi cuotas",             channel: "tiktok",    query: "teclado midi cuotas precio economico",      limit: 5 },
  { label: "Instagram - teclado precio oferta",        channel: "instagram", query: "teclado musical precio oferta cuotas",      limit: 5 },

  // ── Baterista de Departamento ───────────────────────────────────────────
  { label: "YouTube - bateria electronica vecinos",    channel: "youtube",   query: "bateria electronica silenciosa vecinos departamento", limit: 5 },
  { label: "YouTube - drum pad silencioso",            channel: "youtube",   query: "drum pad silencioso departamento auriculares", limit: 5 },
  { label: "Reddit - bateria electronica silenciosa",  channel: "reddit",    query: "bateria electronica silenciosa depto edificio", limit: 5 },
  { label: "X - bateria electronica depto",            channel: "x",         query: "bateria electronica departamento vecinos ruido", limit: 5 },
  { label: "Facebook - drum pad bateria depto",        channel: "facebook",  query: "drum pad bateria departamento ruido vecinos", limit: 5 },
  { label: "TikTok - bateria electronica silencio",    channel: "tiktok",    query: "bateria electronica silenciosa departamento", limit: 5 },
  { label: "Instagram - drum pad silencioso",          channel: "instagram", query: "drum pad silencioso depto auriculares",      limit: 5 },

  // ── Trend-Setter Kressmer ───────────────────────────────────────────────
  { label: "YouTube - kressmer piano",                 channel: "youtube",   query: "kressmer piano teclado",                    limit: 5 },
  { label: "YouTube - teclado disenio premium",        channel: "youtube",   query: "teclado musical diseño premium novedad",    limit: 5 },
  { label: "Instagram - kressmer",                     channel: "instagram", query: "kressmer teclado piano",                    limit: 5 },
  { label: "TikTok - kressmer teclado",                channel: "tiktok",    query: "kressmer piano teclado nuevo modelo",       limit: 5 },
  { label: "X - kressmer nuevo",                       channel: "x",         query: "kressmer piano teclado lanzamiento",        limit: 5 },
  { label: "Reddit - piano digital diseño",            channel: "reddit",    query: "piano digital diseño premium estetica",     limit: 5 },

  // ── Músico Romántico / Hobbysta ─────────────────────────────────────────
  { label: "YouTube - tocar piano en casa adulto",     channel: "youtube",   query: "tocar piano en casa adulto hobby",          limit: 5 },
  { label: "YouTube - piano digital hobby casa",       channel: "youtube",   query: "piano digital casa hobby relajar",          limit: 5 },
  { label: "Reddit - piano hobby adulto",              channel: "reddit",    query: "piano hobby adulto retomar tocar",          limit: 5 },
  { label: "X - piano en casa hobby",                  channel: "x",         query: "piano teclado casa hobby retomar musica",   limit: 5 },
  { label: "Facebook - piano adulto hobby",            channel: "facebook",  query: "piano teclado adulto hobby retomar musica", limit: 5 },
  { label: "TikTok - tocar piano adulto hobby",        channel: "tiktok",    query: "tocar piano adulto hobby casa relajar",     limit: 5 },
  { label: "Instagram - piano hobby casa",             channel: "instagram", query: "piano teclado hobby casa adulto musica",    limit: 5 },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const src of NEW_SOURCES) {
    const result = await prisma.monitoredSource.upsert({
      where: { label: src.label },
      update: {},
      create: { ...src, active: true },
    });
    const isNew = result.createdAt.getTime() === result.updatedAt.getTime();
    if (isNew) { created++; console.log(`  + ${src.label}`); }
    else        { skipped++; }
  }

  console.log(`\nFuentes: ${created} creadas, ${skipped} ya existían.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  await prisma.$disconnect();
  console.error(e);
  process.exit(1);
});
