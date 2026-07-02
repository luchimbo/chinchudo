import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const scripts = await prisma.videoScript.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { persona: true }
  });

  console.log("Recent Video Scripts:");
  scripts.forEach((s) => {
    console.log(`- ID: ${s.id}`);
    console.log(`  Title/Trend: ${s.trendId}`);
    console.log(`  Persona: ${s.persona.name}`);
    console.log(`  Status: ${s.status}`);
    console.log(`  Avatar Job ID: ${s.avatarJobId}`);
    console.log(`  Avatar Status: ${s.avatarStatus}`);
    console.log(`  Video URL: ${s.avatarVideoUrl}`);
    console.log(`  Created At: ${s.createdAt}`);
    console.log("-----------------------------------------");
  });

  await prisma.$disconnect();
}

main();
