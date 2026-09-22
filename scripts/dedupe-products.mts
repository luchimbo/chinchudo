import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient, type Prisma } from "@prisma/client";
// @ts-ignore
import { loadEnv } from "./agent-utils.mjs";
import { catalogNameKey } from "../src/lib/product-identity";

// Unifica productos repetidos dentro de un mismo cliente (mismo nombre sin importar
// mayúsculas, acentos ni signos). Conserva el más completo, le copia lo que le falte
// (por ejemplo la descripción larga), repunta todas las referencias y borra el resto.
// Antes de aplicar guarda un respaldo completo en backups/.
// Uso: npx tsx scripts/dedupe-products.mts [--apply] [--client <slug>]

loadEnv();
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const clientIndex = args.indexOf("--client");
const clientSlug = clientIndex >= 0 ? args[clientIndex + 1] : undefined;
const UNCONFIRMED = "Por confirmar";

const productSelect = {
  id: true, brandId: true, name: true, category: true, description: true, technicalSpecs: true, useCases: true,
  warrantyNotes: true, stockStatus: true, priceRange: true, sourceType: true, sourceExternalId: true, sourceUrl: true,
  sourceSnapshotAt: true, createdAt: true, updatedAt: true,
  brand: { select: { name: true, clientId: true, client: { select: { slug: true } } } },
} satisfies Prisma.ProductSelect;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

// El cargado a mano trae usos, garantía y una categoría normalizada que usa el ranking del catálogo.
function completeness(product: ProductRow) {
  return (product.useCases ? 4 : 0)
    + (product.technicalSpecs ? 4 : 0)
    + (product.warrantyNotes ? 2 : 0)
    + (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.category) ? 2 : 0);
}

function pickKeeper(group: ProductRow[]) {
  return [...group].sort((a, b) => completeness(b) - completeness(a) || a.createdAt.getTime() - b.createdAt.getTime())[0];
}

/** Solo completa campos vacíos del que se conserva; la descripción se reemplaza si hay una más rica. */
function mergedFields(keeper: ProductRow, duplicates: ProductRow[]): Prisma.ProductUpdateInput {
  const data: Prisma.ProductUpdateInput = {};
  const longest = [keeper, ...duplicates].reduce((best, product) => product.description.length > best.description.length ? product : best, keeper);
  if (longest !== keeper) data.description = longest.description;
  for (const field of ["technicalSpecs", "useCases", "warrantyNotes", "sourceUrl"] as const) {
    const donor = duplicates.find((product) => product[field]);
    if (!keeper[field] && donor) data[field] = donor[field];
  }
  for (const field of ["stockStatus", "priceRange"] as const) {
    const donor = duplicates.find((product) => product[field] && product[field] !== UNCONFIRMED);
    if ((!keeper[field] || keeper[field] === UNCONFIRMED) && donor) data[field] = donor[field];
  }
  if (!keeper.sourceExternalId) {
    const donor = duplicates.find((product) => product.sourceExternalId);
    if (donor) {
      data.sourceExternalId = donor.sourceExternalId;
      data.sourceSnapshotAt = donor.sourceSnapshotAt;
    }
  }
  return data;
}

async function references(ids: string[]) {
  const [opportunities, videoScripts, contentIdeas, knowledge, objections, productChoices] = await Promise.all([
    prisma.opportunity.findMany({ where: { detectedProductId: { in: ids } }, select: { id: true, detectedProductId: true, detectedBrandId: true } }),
    prisma.videoScript.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true, brandId: true } }),
    prisma.contentIdea.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true } }),
    prisma.knowledgeBase.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true, brandId: true } }),
    prisma.objection.findMany({ where: { productId: { in: ids } }, select: { id: true, productId: true, brandId: true } }),
    // Elección de producto del Asistente CM guardada en el JSON de la oportunidad.
    Promise.all(ids.map((id) => prisma.opportunity.findMany({
      where: { contextAssessment: { path: ["copilot", "productChoice", "productId"], equals: id } },
      select: { id: true, contextAssessment: true },
    }))).then((rows) => rows.flat()),
  ]);
  return { opportunities, videoScripts, contentIdeas, knowledge, objections, productChoices };
}

async function main() {
  const products = await prisma.product.findMany({
    where: clientSlug ? { brand: { client: { slug: clientSlug } } } : {},
    select: productSelect,
  });
  const groups = new Map<string, ProductRow[]>();
  for (const product of products) {
    const key = `${product.brand.clientId ?? "sin-cliente"}|${catalogNameKey(product.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const plans = [...groups.values()].filter((group) => group.length > 1).map((group) => {
    const keeper = pickKeeper(group);
    const duplicates = group.filter((product) => product.id !== keeper.id);
    return { keeper, duplicates, merge: mergedFields(keeper, duplicates) };
  });

  if (plans.length === 0) {
    console.log("No hay productos repetidos.");
    return;
  }

  const duplicateIds = plans.flatMap((plan) => plan.duplicates.map((product) => product.id));
  const refs = await references(duplicateIds);
  for (const { keeper, duplicates, merge } of plans) {
    console.log(`\n[${keeper.brand.client?.slug}] Se conserva: ${keeper.name} (${keeper.brand.name}, ${keeper.id})`);
    for (const duplicate of duplicates) {
      const count = (rows: { productId?: string | null; detectedProductId?: string | null }[]) => rows.filter((row) => (row.productId ?? row.detectedProductId) === duplicate.id).length;
      console.log(`  - Se borra: ${duplicate.name} (${duplicate.brand.name}, ${duplicate.id}) · oportunidades ${count(refs.opportunities)}, guiones ${count(refs.videoScripts)}, ideas ${count(refs.contentIdeas)}, conocimiento ${count(refs.knowledge)}, objeciones ${count(refs.objections)}`);
    }
    const merged = Object.keys(merge);
    if (merged.length > 0) console.log(`  · Se completa en el conservado: ${merged.join(", ")}`);
  }
  console.log(`\n${duplicateIds.length} productos repetidos en ${plans.length} grupos. Elecciones del Asistente CM a repuntar: ${refs.productChoices.length}.`);

  if (!apply) {
    console.log("\nSimulación: no se cambió nada. Para aplicar: npx tsx scripts/dedupe-products.mts --apply");
    return;
  }

  const backupDir = join(process.cwd(), "backups");
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `product-dedupe-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), plans, references: refs }, null, 2));
  console.log(`\nRespaldo guardado en ${backupPath}`);

  await prisma.$transaction(async (tx) => {
    for (const { keeper, duplicates, merge } of plans) {
      for (const duplicate of duplicates) {
        // Si el repetido estaba en otra marca, las referencias pasan a la marca del conservado.
        const brandChange = duplicate.brandId !== keeper.brandId;
        await tx.opportunity.updateMany({
          where: { detectedProductId: duplicate.id },
          data: { detectedProductId: keeper.id, ...(brandChange ? { detectedBrandId: keeper.brandId } : {}) },
        });
        await tx.videoScript.updateMany({ where: { productId: duplicate.id }, data: { productId: keeper.id, ...(brandChange ? { brandId: keeper.brandId } : {}) } });
        await tx.contentIdea.updateMany({ where: { productId: duplicate.id }, data: { productId: keeper.id } });
        await tx.knowledgeBase.updateMany({ where: { productId: duplicate.id }, data: { productId: keeper.id, ...(brandChange ? { brandId: keeper.brandId } : {}) } });
        await tx.objection.updateMany({ where: { productId: duplicate.id }, data: { productId: keeper.id, ...(brandChange ? { brandId: keeper.brandId } : {}) } });
        for (const opportunity of refs.productChoices) {
          const context = opportunity.contextAssessment as Record<string, any>;
          if (context?.copilot?.productChoice?.productId !== duplicate.id) continue;
          await tx.opportunity.update({
            where: { id: opportunity.id },
            data: { contextAssessment: { ...context, copilot: { ...context.copilot, productChoice: { ...context.copilot.productChoice, productId: keeper.id } } } },
          });
        }
      }
      if (Object.keys(merge).length > 0) await tx.product.update({ where: { id: keeper.id }, data: merge });
      await tx.product.deleteMany({ where: { id: { in: duplicates.map((product) => product.id) } } });
    }
  }, { timeout: 60_000 });

  const remaining = await prisma.product.count({ where: { id: { in: duplicateIds } } });
  console.log(`Listo: ${duplicateIds.length - remaining} productos repetidos borrados.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
