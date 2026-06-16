import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { csvCell, ensureParent, exportsDir, loadEnv, timestamp, writeReport } from "./agent-utils.mjs";

loadEnv();

const prisma = new PrismaClient();

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true"
  };
}

async function main() {
  const args = parseArgs();
  const rows = await prisma.opportunity.findMany({
    include: {
      channel: true,
      detectedBrand: true,
      detectedProduct: true,
      responses: {
        include: { publishingLog: true },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const header = [
    "createdAt",
    "status",
    "priority",
    "channel",
    "brand",
    "product",
    "intent",
    "sourceAuthor",
    "sourceUrl",
    "sourceText",
    "latestDraft",
    "publishedUrl",
    "result"
  ];

  const csvRows = rows.map((row) => {
    const latest = row.responses[0];
    return [
      row.createdAt.toISOString(),
      row.status,
      row.priority,
      row.channel.name,
      row.detectedBrand?.name ?? "",
      row.detectedProduct?.name ?? "",
      row.detectedIntent,
      row.sourceAuthor,
      row.sourceUrl,
      row.sourceText,
      latest?.editedText || latest?.draftText || "",
      latest?.publishingLog?.publishedUrl || "",
      latest?.publishingLog?.result || ""
    ].map(csvCell).join(",");
  });

  const outPath = join(exportsDir, `opportunities-${timestamp()}.csv`);
  if (!args.dryRun) {
    ensureParent(outPath);
    writeFileSync(outPath, `${header.map(csvCell).join(",")}\n${csvRows.join("\n")}\n`, "utf8");
  }

  const report = writeReport("export-csv", {
    command: "export",
    dry_run: args.dryRun,
    rows: rows.length,
    output_path: outPath
  });

  await prisma.$disconnect();
  console.log(`export-csv: ${rows.length} filas${args.dryRun ? " (dry-run)" : ""}. Reporte: ${report}`);
  if (!args.dryRun) console.log(`CSV: ${outPath}`);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
