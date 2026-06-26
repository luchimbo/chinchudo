import { PrismaClient } from "@prisma/client";
// @ts-ignore
import { loadEnv, writeReport } from "./agent-utils.mjs";
import { detectCrossClientTerms } from "../src/lib/guardrails";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  console.log("=== STARTING CROSS-CLIENT RESPONSE AUDIT ===");

  const responses = await prisma.response.findMany({
    include: {
      opportunity: {
        include: {
          client: true,
        },
      },
      brand: true,
      persona: true,
    },
  });

  console.log(`Found ${responses.length} total responses in the database to audit.`);

  const violations: {
    responseId: string;
    opportunityId: string;
    clientSlug: string;
    brandName: string;
    personaName: string;
    text: string;
    violations: string[];
  }[] = [];

  let checked = 0;

  for (const resp of responses) {
    const clientId = resp.opportunity?.clientId || resp.brand?.clientId;
    if (!clientId) {
      // Sin cliente asignado en la oportunidad ni marca; no podemos auditar cruce
      continue;
    }

    const textToAudit = resp.editedText || resp.draftText || "";
    if (!textToAudit) continue;

    checked++;
    const hits = await detectCrossClientTerms(prisma, clientId, textToAudit);

    if (hits.length > 0) {
      violations.push({
        responseId: resp.id,
        opportunityId: resp.opportunityId,
        clientSlug: resp.opportunity?.client?.slug || "unknown",
        brandName: resp.brand?.name || "unknown",
        personaName: resp.persona?.name || "unknown",
        text: textToAudit,
        violations: hits,
      });
    }
  }

  console.log(`Audited ${checked} active responses.`);
  console.log(`Violations detected: ${violations.length}`);

  if (violations.length > 0) {
    console.warn("\n!!! CROSS-CLIENT VIOLATIONS FOUND !!!");
    for (const v of violations) {
      console.warn(`\n- Response ID: ${v.responseId} (Opp: ${v.opportunityId})`);
      console.warn(`  Client: ${v.clientSlug} | Brand: ${v.brandName} | Persona: ${v.personaName}`);
      console.warn(`  Text: "${v.text}"`);
      console.warn(`  Violations: ${v.violations.join(" | ")}`);
    }
  } else {
    console.log("\nNo cross-client violations found. All responses are clean!");
  }

  const reportPath = writeReport("audit-cross-client", {
    total_responses: responses.length,
    audited_responses: checked,
    violations_count: violations.length,
    violations,
  });

  console.log(`\nAudit report written to: ${reportPath}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Audit script failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
