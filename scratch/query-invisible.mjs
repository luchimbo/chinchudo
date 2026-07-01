import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pcmidi = await prisma.client.findUnique({ where: { slug: "pcmidi" } });
  const prestige = await prisma.client.findUnique({ where: { slug: "prestige-running" } });

  if (!pcmidi || !prestige) {
    console.error("Clients not found!");
    return;
  }

  const opportunities = await prisma.opportunity.findMany({
    include: {
      detectedBrand: true,
      monitoredSource: true,
    }
  });

  let invisibleCount = 0;
  for (const op of opportunities) {
    const hasBrandClient = !!op.detectedBrand?.clientId;
    const hasSourceClient = !!op.monitoredSource?.clientId;

    if (!hasBrandClient && !hasSourceClient) {
      invisibleCount++;
      if (invisibleCount <= 20) {
        console.log(`[INVISIBLE #${invisibleCount}]`);
        console.log(`  ID: ${op.id}`);
        console.log(`  URL: ${op.sourceUrl}`);
        console.log(`  Status: ${op.status}`);
        console.log(`  Brand: ${op.detectedBrandId} / MonitoredSource: ${op.monitoredSourceId}`);
        console.log(`  Text: "${op.sourceText.substring(0, 150)}..."`);
        console.log("-----------------------------------------");
      }
    }
  }

  console.log(`Total invisible opportunities (no brand/source client): ${invisibleCount} out of ${opportunities.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
