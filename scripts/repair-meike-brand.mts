// Audit by default; --apply repairs verified Meike identities without rewriting approved text.
import { PrismaClient } from "@prisma/client";
import { mentionsBrand, mentionedBrandId, resolveCatalogBrand } from "../src/lib/brand-identity";
import { validateGeneratedProductBrands } from "../src/lib/product-public-name";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "pcmidi" }, select: { id: true } });
  const brands = await prisma.brand.findMany({ where: { clientId: client.id }, select: { id: true, name: true } });
  const meike = brands.find((brand) => /^meike$/i.test(brand.name));
  if (!meike) throw new Error("No existe la marca Meike para PC MIDI.");
  const products = await prisma.product.findMany({ where: { brand: { clientId: client.id }, name: { contains: "meike", mode: "insensitive" } }, select: { id: true, name: true, brandId: true } });
  const productChanges = products.filter((product) => resolveCatalogBrand(product.name) === "Meike" && product.brandId !== meike.id);
  const verifiedIds = new Set(products.filter((product) => resolveCatalogBrand(product.name) === "Meike").map((product) => product.id));
  const publicProducts = products.filter((product) => verifiedIds.has(product.id)).map((product) => ({ marca: "Meike", nombre: product.name }));
  const opportunities = await prisma.opportunity.findMany({
    where: { clientId: client.id, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED"] } },
    select: { id: true, sourceText: true, sourceTitle: true, detectedBrandId: true, detectedProductId: true, status: true },
  });
  const opportunityChanges = opportunities.filter((opportunity) => opportunity.detectedBrandId !== meike.id
    && (verifiedIds.has(opportunity.detectedProductId ?? "") || mentionedBrandId(`${opportunity.sourceTitle} ${opportunity.sourceText}`, brands) === meike.id));
  const responses = await prisma.response.findMany({
    where: { opportunity: { clientId: client.id, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED"] } }, approvedBy: "", editedText: "", acceptedAsCorrectAt: null, publishingLog: null },
    select: { id: true, opportunityId: true, brandId: true, draftText: true, riskNotes: true },
  });
  const responseChanges = responses.filter((response) => response.brandId !== meike.id && mentionedBrandId(response.draftText, brands) === meike.id);
  const invalidResponses = responses.filter((response) => validateGeneratedProductBrands(response.draftText, publicProducts, brands.map((brand) => brand.name)).length > 0);
  const reviewIds = [...new Set(invalidResponses.map((response) => response.opportunityId))];
  const report = {
    command: "repair-meike-brand", client: "pcmidi", dryRun: !apply,
    inputsRead: { products: products.length, opportunities: opportunities.length, responses: responses.length },
    opportunitiesCreated: 0, discards: 0, errors: [] as string[],
    productChanges, opportunityChanges, responseChanges, invalidResponses,
    summary: { products: productChanges.length, opportunities: opportunityChanges.length, responses: responseChanges.length, needsReview: reviewIds.length },
  };
  // Save exact preimages before writing; the report can be used to restore metadata.
  const reportPath = writeReport("repair-meike-brand", report);
  if (apply) {
    await prisma.$transaction([
      ...productChanges.map((product) => prisma.product.updateMany({ where: { id: product.id, brandId: product.brandId }, data: { brandId: meike.id } })),
      ...opportunityChanges.map((opportunity) => prisma.opportunity.updateMany({ where: { id: opportunity.id, detectedBrandId: opportunity.detectedBrandId, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED"] } }, data: { detectedBrandId: meike.id } })),
      ...responseChanges.map((response) => prisma.response.updateMany({ where: { id: response.id, brandId: response.brandId, approvedBy: "", editedText: "", publishingLog: null }, data: { brandId: meike.id } })),
      ...invalidResponses.map((response) => prisma.response.updateMany({ where: { id: response.id, draftText: response.draftText, approvedBy: "", editedText: "", publishingLog: null }, data: { riskNotes: `${response.riskNotes} Marca/modelo incorrectos: regenerar antes de aprobar.`.trim() } })),
      prisma.opportunity.updateMany({ where: { id: { in: reviewIds }, status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED"] } }, data: { status: "NEEDS_REVIEW" } }),
    ]);
    const remainingProducts = await prisma.product.count({ where: { id: { in: productChanges.map((product) => product.id) }, brandId: { not: meike.id } } });
    const remainingResponses = await prisma.response.count({ where: { id: { in: responseChanges.map((response) => response.id) }, brandId: { not: meike.id } } });
    if (remainingProducts || remainingResponses) throw new Error("La verificación posterior detectó identidades sin corregir.");
  }
  console.log(JSON.stringify({ applied: apply, ...report.summary, reportPath }, null, 2));
}

main().catch((error) => {
  writeReport("repair-meike-brand-error", { command: "repair-meike-brand", dryRun: !apply, errors: [(error as Error).message] });
  console.error((error as Error).message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
