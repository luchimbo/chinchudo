import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport, extractPostKey } from "./agent-utils.mjs";

loadEnv();
const prisma = new PrismaClient();

// Lee un valor de configuración de AppSetting (la misma tabla que usa el dashboard),
// con fallback al default si no existe.
async function getSettingValue(key, fallback) {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row?.value ?? fallback;
  } catch {
    return fallback;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    opportunityId: get("--opportunity-id"),
    responseId: get("--response-id"),
    account: get("--account") || "",
    dryRun: args.includes("--dry-run"),
  };
}

async function main() {
  const { opportunityId, responseId, account, dryRun } = parseArgs();

  if (!opportunityId || !responseId) {
    console.error(
      "Uso: node scripts/publish-response.mjs --opportunity-id <id> --response-id <id> [--account <cuenta>] [--dry-run]"
    );
    process.exit(1);
  }

  const [opportunity, response] = await Promise.all([
    prisma.opportunity.findUniqueOrThrow({
      where: { id: opportunityId },
      include: { channel: true },
    }),
    prisma.response.findUniqueOrThrow({ where: { id: responseId } }),
  ]);

  const text = response.editedText || response.draftText;
  const channel = opportunity.channel.name.toLowerCase();
  const sourceUrl = opportunity.sourceUrl;

  // --- Anti-spam: cap diario por cuenta + separación mínima entre comentarios ---
  if (account && !dryRun) {
    const dailyCap = parseInt(await getSettingValue("PUBLISH_DAILY_PER_ACCOUNT", "8"), 10);
    const spacingMin = parseInt(await getSettingValue("PUBLISH_MIN_SPACING_MIN", "10"), 10);

    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const dayCount = await prisma.publishingLog.count({
      where: { account, publishedAt: { gte: since } },
    });
    if (Number.isFinite(dailyCap) && dayCount >= dailyCap) {
      process.stdout.write(JSON.stringify({
        success: false, error: "rate_limited_daily",
        detail: `cuenta ${account}: ${dayCount}/${dailyCap} en 24h`,
      }) + "\n");
      await prisma.$disconnect();
      process.exit(1);
    }

    const last = await prisma.publishingLog.findFirst({
      where: { account },
      orderBy: { publishedAt: "desc" },
    });
    if (last && Number.isFinite(spacingMin)) {
      const elapsedMin = (Date.now() - new Date(last.publishedAt).getTime()) / 60000;
      if (elapsedMin < spacingMin) {
        process.stdout.write(JSON.stringify({
          success: false, error: "rate_limited_spacing",
          retryAfterSec: Math.ceil((spacingMin - elapsedMin) * 60),
          detail: `cuenta ${account}: ultimo hace ${elapsedMin.toFixed(1)}min (min ${spacingMin})`,
        }) + "\n");
        await prisma.$disconnect();
        process.exit(1);
      }
    }
  }

  const pyArgs = [
    "agents/publisher.py",
    "--channel", channel,
    "--source-url", sourceUrl,
    "--text", text,
  ];
  if (account) pyArgs.push("--account", account);
  if (dryRun) pyArgs.push("--dry-run");

  let result;
  try {
    const output = execFileSync("python", pyArgs, { encoding: "utf-8", cwd: process.cwd() });
    result = JSON.parse(output.trim());
  } catch (err) {
    result = { success: false, error: String(err.message || err) };
  }

  if (result.success && !dryRun) {
    await prisma.$transaction([
      prisma.publishingLog.upsert({
        where: { responseId },
        update: {
          account,
          publishedUrl: result.url || sourceUrl,
          result: "published_via_agent",
          followUpNeeded: false,
        },
        create: {
          opportunityId,
          responseId,
          account,
          publishedUrl: result.url || sourceUrl,
          result: "published_via_agent",
          followUpNeeded: false,
        },
      }),
      prisma.opportunity.update({
        where: { id: opportunityId },
        data: { status: "PUBLISHED" },
      }),
    ]);

    // Cerrar oportunidades HERMANAS del mismo post (mismo video/hilo/publicación)
    // para que ningún otro agente comente dos veces en el mismo lugar.
    const postKey = extractPostKey(channel, sourceUrl);
    if (postKey) {
      const closed = await prisma.opportunity.updateMany({
        where: {
          id: { not: opportunityId },
          channelId: opportunity.channelId,
          status: { in: ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] },
          sourceUrl: { contains: postKey },
        },
        data: {
          status: "DISCARDED",
          notes: `Auto-descartada: ya se publicó un comentario en este post (${postKey}).`,
        },
      });
      result.siblings_closed = closed.count;
    }
  }

  const report = writeReport("publish", {
    command: "publish",
    opportunityId,
    responseId,
    channel,
    account: account || "default",
    dry_run: dryRun,
    ...result,
  });

  process.stdout.write(JSON.stringify({ report, ...result }) + "\n");
  await prisma.$disconnect();

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
