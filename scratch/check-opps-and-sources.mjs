import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== DB STATUS ===");
  
  const [oppCount, sourceCount, responseCount, clientCount, brandCount] = await Promise.all([
    prisma.opportunity.count(),
    prisma.monitoredSource.count(),
    prisma.response.count(),
    prisma.client.count(),
    prisma.brand.count(),
  ]);

  console.log(`Clients: ${clientCount}`);
  console.log(`Brands: ${brandCount}`);
  console.log(`Monitored Sources: ${sourceCount}`);
  console.log(`Opportunities: ${oppCount}`);
  console.log(`Drafts/Responses: ${responseCount}`);

  console.log("\n=== OPPORTUNITIES BY CLIENT AND STATUS ===");
  const oppsByClientAndStatus = await prisma.opportunity.groupBy({
    by: ["clientId", "status"],
    _count: { id: true },
  });
  
  const clients = await prisma.client.findMany({ select: { id: true, name: true, slug: true } });
  const clientMap = new Map(clients.map(c => [c.id, c.slug]));
  
  for (const group of oppsByClientAndStatus) {
    const slug = clientMap.get(group.clientId || "") || "null";
    console.log(`Client [${slug}] - Status [${group.status}]: ${group._count.id} opportunities`);
  }

  console.log("\n=== MONITORED SOURCES IN DB ===");
  const sources = await prisma.monitoredSource.findMany({
    include: { client: true },
    orderBy: { label: "asc" }
  });
  
  for (const src of sources) {
    console.log(`Source [${src.label}] - Client: ${src.client?.slug || "null"} - Channel: ${src.channel} - Active: ${src.active} - Query: "${src.query}"`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
