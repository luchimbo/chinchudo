import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== OPPORTUNITIES BY STATUS ===");
  const statusCounts = await prisma.opportunity.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  statusCounts.forEach((c) => {
    console.log(`- ${c.status}: ${c._count.id}`);
  });

  console.log("\n=== LATEST 15 PUBLISHING LOGS ===");
  const logs = await prisma.publishingLog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 15,
    include: {
      opportunity: {
        select: {
          sourceUrl: true,
          channel: { select: { name: true } }
        }
      }
    }
  });

  if (logs.length === 0) {
    console.log("No publishing logs found.");
  } else {
    logs.forEach((log) => {
      console.log(`[${log.publishedAt.toISOString()}] ID: ${log.opportunityId} | Acc: ${log.account || "N/A"} | Chan: ${log.opportunity?.channel?.name || "N/A"} | Result: ${log.result} | FollowUp: ${log.followUpNeeded}`);
      if (log.publishedUrl) console.log(`  URL: ${log.publishedUrl}`);
    });
  }

  console.log("\n=== LATEST 15 WARN/ERROR SYSTEM LOGS ===");
  const sysLogs = await prisma.systemLog.findMany({
    where: {
      level: { in: ["WARN", "ERROR"] }
    },
    orderBy: { createdAt: "desc" },
    take: 15
  });

  if (sysLogs.length === 0) {
    console.log("No warn/error system logs found.");
  } else {
    sysLogs.forEach((s) => {
      console.log(`[${s.createdAt.toISOString()}] [${s.level}] Event: ${s.event}`);
      console.log(`  Msg: ${s.message}`);
      console.log(`  Meta: ${JSON.stringify(s.meta)}`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
