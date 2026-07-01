import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const personas = await prisma.persona.findMany({
    include: {
      client: true
    }
  });

  console.log("=== PERSONAS IN DATABASE ===");
  for (const p of personas) {
    console.log(`- Persona ID: ${p.id}`);
    console.log(`  Name: ${p.name}`);
    console.log(`  Client: ${p.client?.slug || "GLOBAL/NONE"}`);
    console.log(`  Tone: ${p.tone}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
