import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const visible = await prisma.opportunity.findMany({
    where: {
      status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] },
      responses: { some: {} }
    },
    include: {
      client: true,
      _count: { select: { responses: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 30
  });

  console.log(`=== TOP 30 DRAFTED OPPORTUNITIES ===`);
  for (const opp of visible) {
    console.log(`- ID: ${opp.id}`);
    console.log(`  Client: ${opp.client?.slug || "NONE"}`);
    console.log(`  Status: ${opp.status}`);
    console.log(`  Date: ${opp.createdAt}`);
    console.log(`  Drafts: ${opp._count.responses}`);
    console.log(`  Text: "${opp.sourceText.substring(0, 90)}..."`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
