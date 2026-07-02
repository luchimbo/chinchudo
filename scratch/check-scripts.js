import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const scripts = await prisma.videoScript.findMany({
    orderBy: { createdAt: "desc" },
    take: 5
  });
  console.log(JSON.stringify(scripts.map(x => ({
    id: x.id,
    status: x.status,
    avatarStatus: x.avatarStatus,
    avatarVideoUrl: x.avatarVideoUrl,
    avatarJobId: x.avatarJobId
  })), null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
