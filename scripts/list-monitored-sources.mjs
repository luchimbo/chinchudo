import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.monitoredSource.findMany({
    where: { active: true },
    include: { client: true },
    orderBy: { label: "asc" }
  });
  // Salida JSON en stdout para que el orquestador (Python) la consuma.
  process.stdout.write(
    JSON.stringify(
      sources.map((s) => ({
        id: s.id,
        label: s.label,
        channel: s.channel,
        query: s.query,
        account: s.account || "",
        limit: s.limit,
        lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
        lastCount: s.lastCount ?? 0,
        clientId: s.clientId || "",
        clientSlug: s.client?.slug || "",
      }))
    ) + "\n"
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
