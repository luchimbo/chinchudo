/**
 * Importa catálogo PC MIDI (categorias_pcmidi.json, productos_pcmidi.json, temas_semilla.csv)
 * a las tablas LandingCategory / LandingProduct / SeedTopic en Supabase.
 * Idempotente — usa upsert por @@unique([clientId, key/externalId/keyword]).
 *
 * Uso: npx tsx scripts/import-catalog.mts [--client-slug pcmidi]
 */

import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const prisma = new PrismaClient();

const ROOT = join(process.cwd(), "landing-build", "data");
const CLIENT_SLUG = process.argv.find((a) => a.startsWith("--client-slug="))?.split("=")[1] ?? "pcmidi";

async function main() {
  const client = await prisma.client.findUnique({ where: { slug: CLIENT_SLUG } });
  if (!client) throw new Error(`Cliente '${CLIENT_SLUG}' no encontrado en DB.`);

  console.log(`Importando catálogo para cliente: ${client.name} (${CLIENT_SLUG})`);

  // ── Categorías ────────────────────────────────────────────────────────────
  const catFile = join(ROOT, `categorias_${CLIENT_SLUG}.json`);
  if (!existsSync(catFile)) {
    console.warn(`  [skip] No existe ${catFile}`);
  } else {
    const raw = JSON.parse(await readFile(catFile, "utf-8")) as {
      id: string;
      nombre: string;
      url?: string;
      descripcion?: string;
      keywords?: string[];
    }[];

    let cats = 0;
    for (const cat of raw) {
      await prisma.landingCategory.upsert({
        where: { clientId_key: { clientId: client.id, key: cat.id } },
        create: {
          clientId: client.id,
          key: cat.id,
          name: cat.nombre,
          url: cat.url ?? "",
          description: cat.descripcion ?? "",
          keywords: cat.keywords ?? [],
        },
        update: {
          name: cat.nombre,
          url: cat.url ?? "",
          description: cat.descripcion ?? "",
          keywords: cat.keywords ?? [],
        },
      });
      cats++;
    }
    console.log(`  Categorías: ${cats} upserted`);
  }

  // ── Productos ─────────────────────────────────────────────────────────────
  const prodFile = join(ROOT, `productos_${CLIENT_SLUG}.json`);
  if (!existsSync(prodFile)) {
    console.warn(`  [skip] No existe ${prodFile}`);
  } else {
    const raw = JSON.parse(await readFile(prodFile, "utf-8")) as {
      id: string;
      nombre: string;
      marca?: string;
      modelo?: string;
      categoria_id?: string;
      url?: string;
      uso?: string;
    }[];

    let prods = 0;
    for (const p of raw) {
      await prisma.landingProduct.upsert({
        where: { clientId_externalId: { clientId: client.id, externalId: p.id } },
        create: {
          clientId: client.id,
          externalId: p.id,
          name: p.nombre,
          brand: p.marca ?? "",
          model: p.modelo ?? "",
          categoryKey: p.categoria_id ?? "",
          url: p.url ?? "",
          useText: p.uso ?? "",
        },
        update: {
          name: p.nombre,
          brand: p.marca ?? "",
          model: p.modelo ?? "",
          categoryKey: p.categoria_id ?? "",
          url: p.url ?? "",
          useText: p.uso ?? "",
        },
      });
      prods++;
    }
    console.log(`  Productos: ${prods} upserted`);
  }

  // ── Temas semilla (CSV) ───────────────────────────────────────────────────
  const csvFile = join(ROOT, "temas_semilla.csv");
  if (!existsSync(csvFile)) {
    console.warn(`  [skip] No existe ${csvFile}`);
  } else {
    const lines = (await readFile(csvFile, "utf-8")).split("\n").filter(Boolean);
    const [_header, ...rows] = lines;

    let topics = 0;
    for (const row of rows) {
      const parts = row.split(",");
      if (parts.length < 2) continue;
      const keyword = parts[0].trim();
      const intent = parts[1].trim();
      const suggestedCategories = parts[2]
        ? parts[2]
            .trim()
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      // SeedTopic no tiene @@unique en keyword solo, así que hacemos findFirst + upsert manual
      const existing = await prisma.seedTopic.findFirst({
        where: { clientId: client.id, keyword },
      });
      if (existing) {
        await prisma.seedTopic.update({
          where: { id: existing.id },
          data: { intent, suggestedCategories },
        });
      } else {
        await prisma.seedTopic.create({
          data: { clientId: client.id, keyword, intent, suggestedCategories },
        });
      }
      topics++;
    }
    console.log(`  Temas semilla: ${topics} upserted`);
  }

  console.log("Importación completada.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
