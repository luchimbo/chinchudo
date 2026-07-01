import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    include: {
      _count: {
        select: {
          monitoredSources: true,
          brands: true,
        }
      }
    }
  });

  console.log("=== CLIENTS ===");
  for (const c of clients) {
    console.log(`Client: ${c.name} (${c.slug}) [ID: ${c.id}]`);
    console.log(`  domainKeywords: ${c.domainKeywords}`);
    console.log(`  domainExclusions: ${c.domainExclusions}`);
  }

  const sources = await prisma.monitoredSource.findMany({
    include: { client: true }
  });

  console.log("\n=== MONITORED SOURCES ===");
  for (const s of sources) {
    console.log(`Source: ${s.label} (${s.channel})`);
    console.log(`  Query: "${s.query}"`);
    console.log(`  Client: ${s.client ? `${s.client.name} (${s.client.slug})` : "NONE"}`);
    console.log(`  ID: ${s.id}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
