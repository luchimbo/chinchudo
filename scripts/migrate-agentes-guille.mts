/**
 * Migración de datos históricos de AgentesGuille → Postgres (pcmidi-suite)
 * Importa: geo_audits.jsonl, landings_aprobadas.jsonl, lead_magnets.jsonl
 *
 * Uso: npx tsx scripts/migrate-agentes-guille.mts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const DATA_DIR = path.resolve("D:/AgentesGuille/data");

function readJsonl<T>(filename: string): T[] {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) {
    console.warn(`⚠️  No existe: ${file}`);
    return [];
  }
  return fs
    .readFileSync(file, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

// ─── GEO AUDITS ──────────────────────────────────────────────────────────────
async function migrateGeoAudits() {
  type RawGeo = {
    timestamp_utc: string;
    prompt: string;
    model: string;
    score: number;
    competitors: string[];
    response_text: string;
    content_gap: boolean;
    category?: string;
  };

  const records = readJsonl<RawGeo>("geo_audits.jsonl");
  console.log(`\n📡 GEO Audits: ${records.length} registros`);

  // Borrar existentes para re-importar limpio
  await prisma.geoAudit.deleteMany({});

  let ok = 0;
  for (const r of records) {
    // Parsear timestamp: "20260526-160413-555833" → Date
    let createdAt: Date;
    try {
      const ts = r.timestamp_utc; // "20260526-160413-555833"
      const y = ts.slice(0, 4);
      const mo = ts.slice(4, 6);
      const d = ts.slice(6, 8);
      const hh = ts.slice(9, 11);
      const mm = ts.slice(11, 13);
      const ss = ts.slice(13, 15);
      createdAt = new Date(`${y}-${mo}-${d}T${hh}:${mm}:${ss}Z`);
    } catch {
      createdAt = new Date();
    }

    await prisma.geoAudit.create({
      data: {
        prompt: r.prompt ?? "",
        modeloIA: r.model ?? "desconocido",
        score: typeof r.score === "number" ? r.score : 0,
        competidores: r.competitors ?? [],
        gapsSugeridos: r.content_gap ? ["Sin cobertura detectada"] : [],
        respuestaCompleta: r.response_text ?? "",
        createdAt,
      },
    });
    ok++;
  }
  console.log(`   ✅ ${ok} GEO audits importadas`);
}

// ─── LEAD MAGNETS ─────────────────────────────────────────────────────────────
async function migrateLeadMagnets(): Promise<Map<string, string>> {
  type RawLM = {
    slug: string;
    keyword: string;
    lead_magnet: {
      title: string;
      description: string;
      resource_type: string;
      nurture_sequence?: Record<string, { subject: string; body: string }>;
    };
  };

  const records = readJsonl<RawLM>("lead_magnets.jsonl");
  console.log(`\n🧲 Lead Magnets: ${records.length} registros`);

  // Desduplicar por slug (tomar el primero)
  const bySlug = new Map<string, RawLM>();
  for (const r of records) {
    if (r.slug && !bySlug.has(r.slug)) bySlug.set(r.slug, r);
  }
  console.log(`   Únicos por slug: ${bySlug.size}`);

  const slugToId = new Map<string, string>();

  // Bulk insert ignorando duplicados, luego leer IDs
  const data = [...bySlug.entries()].map(([slug, r]) => ({
    slug,
    tipo: mapTipo(r.lead_magnet?.resource_type ?? "checklist") as
      | "CHECKLIST"
      | "GUIA"
      | "COMPARATIVA"
      | "PLANTILLA"
      | "PRESET",
    titulo: r.lead_magnet?.title ?? slug,
    contenido: r.lead_magnet?.description ?? "",
  }));

  await prisma.leadMagnet.createMany({ data, skipDuplicates: true });

  const existing = await prisma.leadMagnet.findMany({ select: { id: true, slug: true } });
  for (const lm of existing) slugToId.set(lm.slug, lm.id);

  console.log(`   ✅ ${slugToId.size} lead magnets importados`);
  return slugToId;
}

function mapTipo(raw: string): "CHECKLIST" | "GUIA" | "COMPARATIVA" | "PLANTILLA" | "PRESET" {
  const r = raw.toLowerCase();
  if (r.includes("check")) return "CHECKLIST";
  if (r.includes("guia") || r.includes("guía") || r.includes("guide")) return "GUIA";
  if (r.includes("comp")) return "COMPARATIVA";
  if (r.includes("plant") || r.includes("template")) return "PLANTILLA";
  if (r.includes("preset")) return "PRESET";
  return "CHECKLIST";
}

// ─── LANDINGS ─────────────────────────────────────────────────────────────────
async function migrateLandings(slugToLmId: Map<string, string>) {
  type RawLanding = {
    slug: string;
    keyword: string;
    intent: string;
    seo_title: string;
    meta_description: string;
    h1: string;
    hero_lede?: string;
    components?: unknown[];
    steps?: unknown[];
    benefits?: unknown[];
    faqs?: unknown[];
  };

  const records = readJsonl<RawLanding>("landings_aprobadas.jsonl");
  console.log(`\n📄 Landings: ${records.length} registros`);

  // Desduplicar por slug
  const bySlug = new Map<string, RawLanding>();
  for (const r of records) {
    if (r.slug && !bySlug.has(r.slug)) bySlug.set(r.slug, r);
  }
  console.log(`   Únicos por slug: ${bySlug.size}`);

  // Preparar datos para bulk insert
  const data = [...bySlug.entries()].map(([slug, r]) => ({
    slug,
    keyword: r.keyword ?? slug,
    intent: r.intent ?? "",
    titulo: r.h1 ?? r.seo_title ?? slug,
    htmlContent: JSON.stringify({
      h1: r.h1,
      hero_lede: r.hero_lede,
      components: r.components,
      steps: r.steps,
      benefits: r.benefits,
      faqs: r.faqs,
    }),
    seoTitle: r.seo_title ?? "",
    seoDescription: r.meta_description ?? "",
    status: "APPROVED" as const,
    leadMagnetId: slugToLmId.get(slug) ?? null,
  }));

  // Bulk insert ignorando slugs duplicados
  const { count } = await prisma.landing.createMany({ data, skipDuplicates: true });
  console.log(`   ✅ ${count} landings importadas (${bySlug.size - count} ya existían)`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Iniciando migración de datos históricos de AgentesGuille...\n");

  try {
    await migrateGeoAudits();
    const slugToLmId = await migrateLeadMagnets();
    await migrateLandings(slugToLmId);

    // Resumen final
    const [geoCount, lmCount, landingCount] = await Promise.all([
      prisma.geoAudit.count(),
      prisma.leadMagnet.count(),
      prisma.landing.count(),
    ]);

    console.log("\n✨ Migración completada:");
    console.log(`   GEO Audits:   ${geoCount}`);
    console.log(`   Lead Magnets: ${lmCount}`);
    console.log(`   Landings:     ${landingCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
