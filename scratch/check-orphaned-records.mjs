import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const models = [
    "knowledgeBase",
    "objection",
    "landing",
    "leadMagnet",
    "lead",
    "nurtureStep",
    "distributionPiece",
    "geoAudit",
    "trackingEvent"
  ];

  console.log("=== CHECKING FOR ORPHANED RECORDS (clientId = null) ===");
  
  for (const model of models) {
    try {
      const count = await prisma[model].count({
        where: { clientId: null }
      });
      console.log(`Model [${model}]: ${count} orphaned records.`);
      
      if (count > 0) {
        // Fetch a few examples to see what they look like
        const examples = await prisma[model].findMany({
          where: { clientId: null },
          take: 3
        });
        console.log("Examples:", JSON.stringify(examples, null, 2));
      }
    } catch (err) {
      console.error(`Error querying ${model}:`, err.message);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
