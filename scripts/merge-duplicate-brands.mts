// Fusiona marcas duplicadas (mismo cliente, mismo nombre salvo mayúsculas/minúsculas)
// en un único registro Brand, reasignando todas las relaciones (Product, Service,
// Response, VideoScript, Opportunity.detectedBrandId, KnowledgeBase, Objection) al
// registro que queda, y normaliza el nombre final de TODAS las marcas a MAYÚSCULAS.
//
// Por defecto corre en modo --dry-run (sólo reporta). Usar --apply para escribir.
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();
// Interactive transactions don't work reliably over the Supabase pgbouncer
// pooler (DATABASE_URL); use the direct connection for this script.
const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });
const apply = process.argv.includes("--apply");

async function main() {
  const brands = await prisma.brand.findMany({ orderBy: { createdAt: "asc" } });

  const groups = new Map<string, typeof brands>();
  for (const brand of brands) {
    const key = `${brand.clientId ?? "null"}::${brand.name.trim().toUpperCase()}`;
    const list = groups.get(key) ?? [];
    list.push(brand);
    groups.set(key, list);
  }

  let mergedGroups = 0;
  let mergedBrands = 0;
  let renamedOnly = 0;

  for (const [, group] of groups) {
    const upperName = group[0].name.trim().toUpperCase();
    // Prefer as canonical the one already named in uppercase; otherwise the oldest.
    const canonical =
      group.find((b) => b.name.trim() === upperName) ?? group[0];
    const duplicates = group.filter((b) => b.id !== canonical.id);

    if (duplicates.length > 0) {
      mergedGroups += 1;
      mergedBrands += duplicates.length;
      console.log(
        `[MERGE] "${canonical.name}" (${canonical.id}) <- ${duplicates
          .map((d) => `"${d.name}" (${d.id})`)
          .join(", ")}`
      );
    } else if (canonical.name.trim() !== upperName) {
      renamedOnly += 1;
    }

    if (!apply) continue;

    // Run sequentially without an interactive transaction: the Supabase pooler
    // drops long-lived interactive transactions over this connection. The steps
    // below are idempotent (re-deriving duplicate groups from scratch each run),
    // so a mid-run failure is safe to resolve by simply re-running the script.
    for (const dup of duplicates) {
      // Products: reassign, resolving name collisions under the canonical brand.
      const dupProducts = await prisma.product.findMany({ where: { brandId: dup.id } });
      for (const product of dupProducts) {
        const existing = await prisma.product.findFirst({
          where: { brandId: canonical.id, name: product.name },
        });
        if (existing) {
          await prisma.opportunity.updateMany({
            where: { detectedProductId: product.id },
            data: { detectedProductId: existing.id },
          });
          await prisma.videoScript.updateMany({
            where: { productId: product.id },
            data: { productId: existing.id },
          });
          await prisma.contentIdea.updateMany({
            where: { productId: product.id },
            data: { productId: existing.id },
          });
          await prisma.product.delete({ where: { id: product.id } });
        } else {
          await prisma.product.update({ where: { id: product.id }, data: { brandId: canonical.id } });
        }
      }

      // Services: same collision handling.
      const dupServices = await prisma.service.findMany({ where: { brandId: dup.id } });
      for (const service of dupServices) {
        const existing = await prisma.service.findFirst({
          where: { brandId: canonical.id, name: service.name },
        });
        if (existing) {
          await prisma.service.delete({ where: { id: service.id } });
        } else {
          await prisma.service.update({ where: { id: service.id }, data: { brandId: canonical.id } });
        }
      }

      await prisma.response.updateMany({ where: { brandId: dup.id }, data: { brandId: canonical.id } });
      await prisma.videoScript.updateMany({ where: { brandId: dup.id }, data: { brandId: canonical.id } });
      await prisma.opportunity.updateMany({ where: { detectedBrandId: dup.id }, data: { detectedBrandId: canonical.id } });
      await prisma.knowledgeBase.updateMany({ where: { brandId: dup.id }, data: { brandId: canonical.id } });
      await prisma.objection.updateMany({ where: { brandId: dup.id }, data: { brandId: canonical.id } });

      await prisma.brand.delete({ where: { id: dup.id } });
    }

    if (canonical.name.trim() !== upperName) {
      await prisma.brand.update({ where: { id: canonical.id }, data: { name: upperName } });
    }
  }

  console.log(
    `\n${apply ? "Aplicado" : "Dry-run"}: ${mergedGroups} grupos con duplicados (${mergedBrands} marcas fusionadas), ${renamedOnly} marcas renombradas a MAYÚSCULAS sin duplicados.`
  );
  if (!apply) console.log("Corré con --apply para escribir los cambios.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
