import { PrismaClient } from "@prisma/client";
import { loadEnv, writeReport, extractPostKey } from "./agent-utils.mjs";
import { checkPublishRateLimits } from "./publish-utils.mjs";
// Importa .ts con alias "@/": correr con tsx (npm run agents:publish o node --import tsx).
import { publishYouTubeComment } from "../src/lib/youtube-publisher.ts";
import { resolveYouTubeAccount } from "../src/lib/youtube-connection.ts";

loadEnv();
const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  return {
    opportunityId: get("--opportunity-id"),
    responseId: get("--response-id"),
    // Sólo elige entre conexiones OAuth del cliente; un perfil de accounts.json se ignora.
    requestedAccount: get("--account") || "",
    dryRun: args.includes("--dry-run"),
  };
}

async function main() {
  const { opportunityId, responseId, requestedAccount, dryRun } = parseArgs();

  if (!opportunityId || !responseId) {
    console.error(
      "Uso: npm run agents:publish -- --opportunity-id <id> --response-id <id> [--account <conexión de YouTube>] [--dry-run]"
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

  if (response.opportunityId !== opportunityId || !["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"].includes(opportunity.status)) {
    throw new Error("La oportunidad ya fue respondida o la respuesta no le pertenece.");
  }
  if (!response.approvedBy) {
    throw new Error("La respuesta debe estar aprobada antes de publicar.");
  }
  if (channel === "facebook" || channel === "instagram") {
    process.stdout.write(JSON.stringify({ success: false, error: "human_handoff_required", method: "failed" }) + "\n");
    await prisma.$disconnect();
    process.exit(1);
  }
  if (channel !== "youtube") {
    process.stdout.write(JSON.stringify({ success: false, error: "official_publish_only_available_for_youtube", method: "failed" }) + "\n");
    await prisma.$disconnect();
    process.exit(1);
  }
  if (!opportunity.clientId) {
    process.stdout.write(JSON.stringify({ success: false, error: "youtube_client_required", method: "failed" }) + "\n");
    await prisma.$disconnect();
    process.exit(1);
  }
  // Se resuelve también en --dry-run: sin conexión, la publicación real fallaría.
  const account = await resolveYouTubeAccount(prisma, opportunity.clientId, requestedAccount);
  if (!account) {
    process.stdout.write(JSON.stringify({ success: false, error: "youtube_not_connected", method: "failed" }) + "\n");
    await prisma.$disconnect();
    process.exit(1);
  }

  // --- Anti-spam: cap diario por cuenta + separación mínima entre comentarios ---
  if (!dryRun) {
    const rateLimit = await checkPublishRateLimits(prisma, account);
    if (!rateLimit.ok) {
      process.stdout.write(JSON.stringify({
        success: false, error: rateLimit.error,
        ...(rateLimit.retryAfterSec ? { retryAfterSec: rateLimit.retryAfterSec } : {}),
      }) + "\n");
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const result = await publishYouTubeComment({
    prisma,
    clientId: opportunity.clientId,
    account,
    sourceUrl,
    text,
    dryRun,
  });

  if (result.success && !dryRun) {
    await prisma.$transaction([
      prisma.publishingLog.upsert({
        where: { responseId },
        update: {
          account,
          publishedUrl: result.url || sourceUrl,
          result: result.method,
          publishMethod: result.method,
          remoteId: result.remoteId,
          followUpNeeded: false,
        },
        create: {
          opportunityId,
          responseId,
          account,
          publishedUrl: result.url || sourceUrl,
          result: result.method,
          publishMethod: result.method,
          remoteId: result.remoteId,
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
    account,
    requested_account: requestedAccount,
    dry_run: dryRun,
    ...result,
  });

  process.stdout.write(JSON.stringify({ report, account, ...result }) + "\n");
  await prisma.$disconnect();

  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
