import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { cmIsFresh } from "./cm-freshness";
import { loadCMVersion } from "./cm-version";

/** Call after authorizing the tenant. Coverage snapshots never authorize actions. */
export async function assertCurrentCMResponse(db: PrismaClient, clientId: string, responseId: string, opportunityId?: string) {
  const row = await db.response.findFirst({ where: { id: responseId, ...(opportunityId ? { opportunityId } : {}), opportunity: { clientId } },
    select: { evidence: true, approvedBy: true, editedText: true, acceptedAsCorrectAt: true,
      opportunity: { select: { sourceText: true, sourceTitle: true, channelId: true, detectedIntent: true,
        detectedProductId: true, detectedBrandId: true, contextAssessment: true, channel: { select: { name: true } } } } } });
  if (!row) throw new Error("La respuesta no corresponde a este cliente y oportunidad.");
  if (row.opportunity.channel.name !== "YouTube") return;
  const current = await loadCMVersion(db, clientId);
  if (cmIsFresh(row.evidence, current, row.opportunity)) return;
  // Accepting this response can add the response itself and its learned memories
  // to the context. That feedback must not invalidate its own prior review.
  if (row.approvedBy || row.editedText || row.acceptedAsCorrectAt) {
    const withoutOwnFeedback = await loadCMVersion(db, clientId, { excludeFeedbackFromResponseId: responseId });
    if (cmIsFresh(row.evidence, withoutOwnFeedback, row.opportunity)) return;
  }
  throw new Error("La propuesta quedó desactualizada o no tiene una versión verificable. Generá una propuesta nueva antes de aplicarla o publicarla. Tu edición se conserva.");
}

export async function claimYouTubePublication(db: PrismaClient, clientId: string, opportunityId: string) {
  // UPDATE locks the row and rechecks the predicate after a competing commit.
  // Persist the intent BEFORE contacting YouTube, including if the request dies.
  const attemptId = randomUUID();
  const rows = await db.$queryRaw<{ id: string }[]>`UPDATE "Opportunity" SET "contextAssessment" = coalesce("contextAssessment", '{}'::jsonb) || jsonb_build_object('cmPublicationPending', true, 'cmPublicationAttemptId', ${attemptId}::text, 'cmPublicationSendingUntil', extract(epoch FROM clock_timestamp() + interval '2 minutes') * 1000), "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${opportunityId} AND "clientId" = ${clientId} AND status::text IN ('NEW','NEEDS_REVIEW','DRAFTED','APPROVED')
    AND coalesce("contextAssessment"->>'cmPublicationPending','false') != 'true'
    AND NOT EXISTS (SELECT 1 FROM "PublishingLog" p WHERE p."opportunityId" = "Opportunity".id)
    RETURNING id`;
  return rows.length === 1 ? attemptId : null;
}

export async function markYouTubePublicationAmbiguous(db: PrismaClient, clientId: string, opportunityId: string, attemptId: string) {
  await db.$executeRaw`UPDATE "Opportunity" SET "contextAssessment" = "contextAssessment" || '{"cmPublicationAmbiguous":true}'::jsonb WHERE id = ${opportunityId} AND "clientId" = ${clientId} AND "contextAssessment"->>'cmPublicationAttemptId' = ${attemptId}`;
}

export async function clearYouTubePublication(db: PrismaClient, clientId: string, opportunityId: string, attemptId?: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`UPDATE "Opportunity" SET "contextAssessment" = coalesce("contextAssessment", '{}'::jsonb) - 'cmPublicationPending' - 'cmPublicationAttemptId' - 'cmPublicationSendingUntil' - 'cmPublicationAmbiguous', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = ${opportunityId} AND "clientId" = ${clientId}
    AND (${attemptId || ""} != '' AND "contextAssessment"->>'cmPublicationAttemptId' = ${attemptId || ""}
      OR ${attemptId || ""} = '' AND ("contextAssessment"->>'cmPublicationAmbiguous' = 'true' OR coalesce(("contextAssessment"->>'cmPublicationSendingUntil')::numeric, 0) < extract(epoch FROM clock_timestamp()) * 1000)) RETURNING id`;
  return rows.length === 1;
}
