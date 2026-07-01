import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    where: { active: true }
  });

  console.log("=== CLIENT API CONFIGURATIONS ===");
  for (const client of clients) {
    console.log(`- Slug: ${client.slug}`);
    console.log(`  Name: ${client.name}`);
    console.log(`  Has custom API key: ${!!client.openrouterApiKey}`);
    console.log(`  API key length: ${client.openrouterApiKey?.length || 0}`);
    console.log(`  Model: ${client.openrouterModel || "DEFAULT"}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
