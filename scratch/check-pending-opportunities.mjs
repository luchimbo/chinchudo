import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const pending = await prisma.opportunity.findMany({
    where: {
      status: { in: ["NEW", "NEEDS_REVIEW"] },
      responses: { none: {} }
    },
    include: {
      client: true
    }
  });

  console.log(`Found ${pending.length} pending opportunities with no responses:`);
  for (const opp of pending) {
    console.log(`- ID: ${opp.id}`);
    console.log(`  Client: ${opp.client?.slug || "NONE"}`);
    console.log(`  Text: "${opp.sourceText.substring(0, 100)}..."`);
    console.log(`  Created: ${opp.createdAt}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
