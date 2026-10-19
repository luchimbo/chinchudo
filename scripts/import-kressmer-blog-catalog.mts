// Carga las fichas verificadas de Kressmer en el catálogo del blog del cliente
// kressmer, con enlaces a las páginas reales de kressmer.com. Sin esto el
// generador no tiene productos para citar ni para comparar.
// Uso: npx tsx scripts/import-kressmer-blog-catalog.mts [--dry-run]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const dryRun = process.argv.includes("--dry-run");
const knowledge = JSON.parse(readFileSync("data/kressmer-product-knowledge.json", "utf8")) as {
  source: string; responseRules: string;
  products: { model: string; description: string; features: string[]; included: string[]; optional: string[]; useCases: string; notes: string }[];
};
const STORE = "https://www.kressmer.com";
const CATEGORY = { key: "pianos-digitales", name: "Pianos digitales", url: `${STORE}/`, description: "Pianos digitales Kressmer de 88 teclas para estudio y práctica en casa.", keywords: ["piano digital", "88 teclas", "kressmer"] };

const prisma = new PrismaClient();
const report = { command: "import-kressmer-blog-catalog", date: new Date().toISOString(), dryRun, inputsRead: knowledge.products.length, created: 0, updated: 0, errors: [] as string[], products: [] as string[] };
try {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "kressmer" }, select: { id: true } });
  if (!dryRun) {
    await prisma.landingCategory.upsert({
      where: { clientId_key: { clientId: client.id, key: CATEGORY.key } },
      create: { clientId: client.id, ...CATEGORY },
      update: { name: CATEGORY.name, url: CATEGORY.url, description: CATEGORY.description, keywords: CATEGORY.keywords, linkStatus: "active" },
    });
  }
  for (const item of knowledge.products) {
    const externalId = `kressmer-${item.model.toLowerCase()}`;
    const url = `${STORE}/products/${item.model.toLowerCase()}`;
    const useText = [item.description, `Ficha: ${item.features.join("; ")}.`, item.included.length ? `Incluye: ${item.included.join("; ")}.` : "", item.useCases].filter(Boolean).join(" ");
    const data = { name: `Kressmer ${item.model}`, brand: "Kressmer", model: item.model, categoryKey: CATEGORY.key, url, useText, sourceSnapshot: { source: knowledge.source, responseRules: knowledge.responseRules, ...item }, linkStatus: "active" };
    report.products.push(`${externalId} -> ${url}`);
    if (dryRun) continue;
    const existing = await prisma.landingProduct.findUnique({ where: { clientId_externalId: { clientId: client.id, externalId } } });
    await prisma.landingProduct.upsert({ where: { clientId_externalId: { clientId: client.id, externalId } }, create: { clientId: client.id, externalId, ...data }, update: data });
    if (existing) report.updated += 1; else report.created += 1;
  }
} catch (error) {
  report.errors.push(String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/${Date.now()}-import-kressmer-blog-catalog.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
