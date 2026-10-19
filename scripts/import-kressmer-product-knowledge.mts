import { PrismaClient } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { loadRelevantKnowledge } from "../src/lib/knowledge";

// node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/import-kressmer-product-knowledge.mts [--dry-run]
const dryRun = process.argv.includes("--dry-run");
const prisma = new PrismaClient();
const schema = z.object({
  source: z.string().min(1), responseRules: z.string().min(1),
  products: z.array(z.object({
    model: z.string().min(1), description: z.string().min(1),
    features: z.array(z.string()).min(1), included: z.array(z.string()).min(1),
    optional: z.array(z.string()), useCases: z.string().min(1), notes: z.string().min(1),
  })).length(6),
});
const report = { command: process.argv.slice(1).join(" "), date: new Date().toISOString(), channel: "knowledge", dryRun, client: "pcmidi", inputsRead: 0, opportunitiesCreated: 0, productsUpdated: 0, productsCreated: 0, knowledgeSaved: 0, verified: 0, discards: [] as string[], errors: [] as string[], products: [] as { model: string; id: string; action: string }[] };
const stamp = report.date.replace(/[:.]/g, "-");
try {
  const input = schema.parse(JSON.parse(await readFile("data/kressmer-product-knowledge.json", "utf8")));
  report.inputsRead = input.products.length;
  if (new Set(input.products.map(p => p.model)).size !== input.products.length) throw new Error("Modelos repetidos en la entrada");
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "pcmidi" } });
  const brands = await prisma.brand.findMany({ where: { clientId: client.id, name: { equals: "Kressmer", mode: "insensitive" } } });
  if (brands.length !== 1) throw new Error(`Se esperaba una marca Kressmer del cliente pcmidi; encontradas: ${brands.length}`);
  const brand = brands[0];
  const existing = await prisma.product.findMany({ where: { brandId: brand.id } });
  const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const plan = input.products.flatMap(ficha => {
    // Límite de modelo para no confundir K-88 con K-880, ni 3008 con otro código.
    const model = ficha.model.replace(/-/g, "[-\\s]*");
    const pattern = new RegExp(`(?:^|[^A-Z0-9])${model}(?=$|[^A-Z0-9])`, "i");
    const matches = existing.filter(p => pattern.test(p.name) || normalize(p.name) === `KRESSMER${normalize(ficha.model)}`);
    if (matches.length > 1) console.log(`El modelo ${ficha.model} tiene ${matches.length} registros existentes; se actualizarán sus fichas conservando sus identidades.`);
    const technicalSpecs = [
      `Ficha suministrada: ${input.source}.`, ...ficha.features.map(s => `- ${s}`),
      `Incluye en caja: ${ficha.included.join("; ")}.`,
      ...(ficha.optional.length ? [`Opcionales (no incluidos de serie): ${ficha.optional.join("; ")}.`] : []),
      `Precisiones: ${ficha.notes}`, `Reglas de respuesta: ${input.responseRules}`,
    ].join("\n");
    return (matches.length ? matches : [undefined]).map(product => ({ ficha, existing: product, technicalSpecs, content: `${ficha.description}\n${technicalSpecs}\nUsos: ${ficha.useCases}`, topic: `Kressmer ${ficha.model}: ficha técnica y contenido de caja` }));
  });
  await mkdir("reports", { recursive: true });
  if (!dryRun) {
    const knowledge = await prisma.knowledgeBase.findMany({ where: { clientId: client.id, brandId: brand.id } });
    await mkdir("backups", { recursive: true });
    await writeFile(`backups/kressmer-knowledge-${stamp}.json`, JSON.stringify({ date: report.date, products: existing, knowledge }, null, 2));
  }
  for (const item of plan) {
    console.log(`${dryRun ? "SIMULACIÓN" : "IMPORTAR"} ${item.ficha.model}: ${item.existing?.name ?? "nuevo producto"}`);
  }
  if (!dryRun) await prisma.$transaction(async tx => {
    for (const item of plan) {
      const data = { description: item.ficha.description, technicalSpecs: item.technicalSpecs, useCases: item.ficha.useCases };
      // Conservar nombre, referencias de tienda, precio, stock y garantía existentes.
      const product = item.existing
        ? await tx.product.update({ where: { id: item.existing.id }, data })
        : await tx.product.create({ data: { ...data, brandId: brand.id, name: `Kressmer ${item.ficha.model}`, category: "pianos-digitales" } });
      const where = { clientId: client.id, brandId: brand.id, productId: product.id, topic: item.topic };
      const kb = await tx.knowledgeBase.findMany({ where });
      if (kb.length > 1) throw new Error(`Ficha duplicada en conocimiento: ${item.ficha.model}`);
      const knowledgeData = { ...where, content: item.content, source: input.source, confidence: "high" };
      if (kb[0]) await tx.knowledgeBase.update({ where: { id: kb[0].id }, data: knowledgeData });
      else await tx.knowledgeBase.create({ data: knowledgeData });
      report.products.push({ model: item.ficha.model, id: product.id, action: item.existing ? "updated" : "created" });
      report[item.existing ? "productsUpdated" : "productsCreated"]++;
      report.knowledgeSaved++;
    }
  }, { timeout: 60000 });
  // Lectura posterior a la escritura y recuperación por el mismo helper del generador.
  for (const row of report.products) {
    const item = plan.find(p => p.ficha.model === row.model)!;
    const product = await prisma.product.findUniqueOrThrow({ where: { id: row.id } });
    const result = await loadRelevantKnowledge(prisma, { clientId: client.id, brandId: brand.id, productId: row.id, sourceText: `¿Qué incluye el Kressmer ${row.model}?` });
    if (product.technicalSpecs !== item.technicalSpecs || product.description !== item.ficha.description || !result.knowledge.some(k => k.content === item.content)) throw new Error(`Verificación fallida: ${row.model}`);
    report.verified++;
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/kressmer-knowledge-${stamp}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}
