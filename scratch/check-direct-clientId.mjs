import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const opportunities = await prisma.opportunity.findMany();
  
  let nullCount = 0;
  for (const op of opportunities) {
    if (!op.clientId) {
      nullCount++;
    }
  }

  console.log(`Opportunities: ${opportunities.length}`);
  console.log(`Opportunities with clientId = null: ${nullCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
