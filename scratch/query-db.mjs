import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prestige = await prisma.client.findUnique({ where: { slug: "prestige-running" } });
  if (!prestige) {
    console.error("Prestige client not found!");
    return;
  }

  const opportunities = await prisma.opportunity.findMany({
    where: {
      OR: [
        { detectedBrand: { clientId: prestige.id } },
        { monitoredSource: { clientId: prestige.id } }
      ]
    },
    include: {
      detectedBrand: true,
      monitoredSource: true,
      responses: true,
    }
  });

  console.log(`Prestige Running Opportunities: ${opportunities.length}`);
  for (const op of opportunities) {
    console.log(`- ID: ${op.id} | Status: ${op.status} | Intent: ${op.detectedIntent}`);
    console.log(`  Source: ${op.monitoredSource?.label || "None"}`);
    console.log(`  Brand: ${op.detectedBrand?.name || "None"}`);
    console.log(`  Text: "${op.sourceText}"`);
    console.log(`  Responses: ${op.responses.length} responses generated`);
    console.log("-----------------------------------------");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
