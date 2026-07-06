import { PrismaClient, OpportunityStatus } from "@prisma/client";
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { resolveOpportunityClient } from "../src/lib/client-context";
import { triageOpportunity } from "../src/lib/opportunity-triage";

loadEnv();

const prisma = new PrismaClient();

function argValue(name: string, fallback = "") {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || fallback) : fallback;
}

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run") || process.env.npm_config_dry_run === "true",
    assignClients: process.argv.includes("--assign-clients") || process.env.npm_config_assign_clients === "true",
    discardNoise: process.argv.includes("--discard-noise") || process.env.npm_config_discard_noise === "true",
    clientSlug: argValue("--client", process.env.npm_config_client || ""),
    limit: Math.min(500, Math.max(1, Number(argValue("--limit", process.env.npm_config_limit || "200")))),
  };
}

async function main() {
  const args = parseArgs();
  const client = args.clientSlug
    ? await prisma.client.findUnique({ where: { slug: args.clientSlug } })
    : null;

  let assignedClients = 0;
  let discardedNoise = 0;
  const errors: { opportunityId: string; error: string }[] = [];
  const decisions: { opportunityId: string; action: string; reason: string; score: number }[] = [];

  if (args.assignClients) {
    const missingClient = await prisma.opportunity.findMany({
      where: {
        clientId: null,
        status: { in: [OpportunityStatus.NEW, OpportunityStatus.NEEDS_REVIEW] },
      },
      include: {
        detectedBrand: { include: { client: true } },
        monitoredSource: { include: { client: true } },
      },
      orderBy: { createdAt: "desc" },
      take: args.limit,
    });

    for (const opportunity of missingClient) {
      try {
        const resolution = client
          ? { client, confidence: "medium" as const, reason: "cli_client_scope" }
          : await resolveOpportunityClient(prisma, opportunity);

        if (!args.dryRun) {
          await prisma.opportunity.update({
            where: { id: opportunity.id },
            data: {
              clientId: resolution.client.id,
              notes: [
                opportunity.notes,
                `Cliente asignado por triage CLI: ${resolution.client.slug} (${resolution.confidence}, ${resolution.reason}).`,
              ].filter(Boolean).join(" "),
            },
          });
        }
        assignedClients += 1;
      } catch (error) {
        errors.push({ opportunityId: opportunity.id, error: (error as Error).message });
      }
    }
  }

  if (args.discardNoise) {
    const rows = await prisma.opportunity.findMany({
      where: {
        status: { in: [OpportunityStatus.NEW, OpportunityStatus.NEEDS_REVIEW] },
        responses: { none: {} },
        ...(client ? { clientId: client.id } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: args.limit,
    });

    for (const opportunity of rows) {
      const decision = triageOpportunity(opportunity);
      decisions.push({
        opportunityId: opportunity.id,
        action: decision.action,
        reason: decision.reason,
        score: decision.score,
      });

      if (decision.action !== "discard") continue;
      if (!args.dryRun) {
        await prisma.opportunity.update({
          where: { id: opportunity.id },
          data: {
            status: OpportunityStatus.DISCARDED,
            notes: [
              opportunity.notes,
              `Auto-descartada por triage CLI: ${decision.reason} (score ${decision.score}).`,
            ].filter(Boolean).join(" "),
          },
        });
      }
      discardedNoise += 1;
    }
  }

  const report = writeReport("triage-opportunities", {
    command: "triage-opportunities",
    dry_run: args.dryRun,
    assign_clients: args.assignClients,
    discard_noise: args.discardNoise,
    client: args.clientSlug || null,
    assigned_clients: assignedClients,
    discarded_noise: discardedNoise,
    decisions,
    errors,
  });

  await prisma.$disconnect();

  if (errors.length) {
    console.error(`triage-opportunities: ${errors.length} errores. Reporte: ${report}`);
    process.exit(1);
  }
  console.log(`triage-opportunities: ${assignedClients} clientes asignados, ${discardedNoise} descartes. Reporte: ${report}`);
}

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
