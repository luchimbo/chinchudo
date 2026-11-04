import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import type { manualJobInput } from "./cm-manual-jobs";
import { ClientResolutionError } from "./auth";
import { cmRulesVersion } from "./cm-version";
import { cmHash } from "./cm-freshness";

export type SignedTenantClaims = { email: string; tokenVersion: number };
type Admission = { authenticated: boolean; authorized: boolean; owned: boolean; valid: boolean; keyMismatch: boolean; job: { id: string; status: string } | null };

// Compare the actual sources at admission and execution, including changes while
// queued. The worker still computes the exact editorial version before saving.
// Only digests leave Postgres; client credentials never enter this projection.
function contextFingerprint(clientId: Prisma.Sql) {
  const runtime = cmHash({ rules: cmRulesVersion(), model: ["LLM_PROVIDER", "LLM_LOCAL_MODEL", "LLM_MODEL", "OPENROUTER_MODEL", "LLM_LOCAL_START", "LLM_LOCAL_END", "LLM_SCHEDULE_TIMEZONE"].map(key => process.env[key] || "") });
  return Prisma.sql`md5(jsonb_build_object(
    'runtime', ${runtime},
    'client', (SELECT jsonb_build_array(c.id,c.slug,c.name,c.description,c."responsePolicy",c."domainKeywords",c."domainExclusions",c."storeUrl",c."openrouterModel") FROM "Client" c WHERE c.id = ${clientId}),
    'prompts', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "PromptVersion" p WHERE p.name = 'response-generator' AND p.active),
    'brands', (SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM "Brand" b WHERE b."clientId" = ${clientId}),
    'products', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Product" p JOIN "Brand" b ON b.id = p."brandId" WHERE b."clientId" = ${clientId}),
    'services', (SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "Service" s JOIN "Brand" b ON b.id = s."brandId" WHERE b."clientId" = ${clientId}),
    'personas', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "Persona" p WHERE p."clientId" = ${clientId}),
    'personaRules', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "PersonaRule" r JOIN "Persona" p ON p.id = r."personaId" WHERE p."clientId" = ${clientId}),
    'rules', (SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "CatalogRule" r WHERE r."clientId" = ${clientId}),
    'knowledge', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.id) FROM "KnowledgeBase" k WHERE k."clientId" = ${clientId} OR k."clientId" IS NULL),
    'objections', (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.id) FROM "Objection" k WHERE k."clientId" = ${clientId} OR k."clientId" IS NULL),
    'memories', (SELECT jsonb_agg(jsonb_build_array(m.id,m.rule,m.category,m."responseId") ORDER BY m.id) FROM "ClientMemory" m WHERE m."clientId" = ${clientId} AND m.active),
    'examples', (SELECT jsonb_agg(jsonb_build_array(r.id,r."brandId",r."draftText",r."editedText",r."acceptedAsCorrectAt") ORDER BY r.id) FROM "Response" r JOIN "Opportunity" e ON e.id = r."opportunityId" WHERE e."clientId" = ${clientId} AND r."acceptedAsCorrectAt" IS NOT NULL),
    'channels', (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "Channel" c WHERE c.name = 'YouTube')
  )::text)`;
}

function inputFingerprint() {
  return Prisma.sql`'db-v1:' || md5(to_jsonb(o)::text || coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM "Response" r WHERE r."opportunityId" = o.id), '[]') || ${contextFingerprint(Prisma.sql`o."clientId"`)})`;
}

/** JWT signature is verified by auth.ts; this statement checks current DB authority
 * and inserts the job from the SAME snapshot. No cached coverage authorizes work. */
export async function fastManualAdmission(db: PrismaClient, claims: SignedTenantClaims, input: z.infer<typeof manualJobInput>) {
  const parameters = { ...(input.responseId ? { responseId: input.responseId } : {}), ...(input.productId !== undefined ? { productId: input.productId } : {}), ...(input.chatHistory ? { chatHistory: input.chatHistory } : {}) };
  const query = Prisma.sql`
    WITH session AS MATERIALIZED (
      SELECT u.email, c.id AS "clientId", c.slug, c.active FROM "User" u JOIN "Client" c ON c.id = u."clientId"
      WHERE u.email = ${claims.email} AND u."tokenVersion" = ${claims.tokenVersion}
    ), authority AS MATERIALIZED (
      SELECT * FROM session WHERE slug = ${input.client} AND active = true
    ), owned AS MATERIALIZED (
      SELECT o.* FROM "Opportunity" o JOIN authority a ON a."clientId" = o."clientId" WHERE o.id = ${input.opportunityId}
    ), eligible AS MATERIALIZED (
      SELECT o.* FROM owned o JOIN "Channel" c ON c.id = o."channelId" WHERE c.name = 'YouTube'
      AND o.status::text IN ('NEW','NEEDS_REVIEW','DRAFTED','APPROVED')
      AND NOT EXISTS (SELECT 1 FROM "PublishingLog" p WHERE p."opportunityId" = o.id)
      AND (${input.responseId || ""} = '' OR EXISTS (SELECT 1 FROM "Response" r WHERE r.id = ${input.responseId || ""} AND r."opportunityId" = o.id))
      AND (${input.productId || ""} = '' OR EXISTS (SELECT 1 FROM "Product" p JOIN "Brand" b ON b.id = p."brandId" WHERE p.id = ${input.productId || ""} AND b."clientId" = o."clientId"))
    ), existing AS MATERIALIZED (
      SELECT j.* FROM "CMManualJob" j JOIN authority a ON a."clientId" = j."clientId" WHERE j."idempotencyKey" = ${input.idempotencyKey}
    ), active AS MATERIALIZED (
      SELECT j.id, j.status FROM "CMManualJob" j JOIN eligible o ON o.id = j."opportunityId" AND o."clientId" = j."clientId" WHERE j.status IN ('QUEUED','RUNNING')
    ), inserted AS (
      INSERT INTO "CMManualJob" (id, "clientId", "requestedBy", "opportunityId", action, parameters, "idempotencyKey", "inputVersion", "createdAt", "updatedAt")
      SELECT ${randomUUID()}, o."clientId", a.email, o.id, ${input.action}, ${JSON.stringify(parameters)}::jsonb, ${input.idempotencyKey},
        ${inputFingerprint()},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM eligible o JOIN authority a ON a."clientId" = o."clientId"
      WHERE NOT EXISTS (SELECT 1 FROM existing) AND NOT EXISTS (SELECT 1 FROM active)
      ON CONFLICT DO NOTHING RETURNING id, status
    )
    SELECT EXISTS (SELECT 1 FROM session) AS authenticated, EXISTS (SELECT 1 FROM authority) AS authorized,
      EXISTS (SELECT 1 FROM owned) AS owned, EXISTS (SELECT 1 FROM eligible) AS valid,
      EXISTS (SELECT 1 FROM existing WHERE "opportunityId" != ${input.opportunityId} OR action != ${input.action}) AS "keyMismatch",
      coalesce((SELECT jsonb_build_object('id',id,'status',status) FROM existing WHERE "opportunityId" = ${input.opportunityId} AND action = ${input.action}),
        (SELECT jsonb_build_object('id',id,'status',status) FROM active),
        (SELECT jsonb_build_object('id',id,'status',status) FROM inserted)) AS job`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const [result] = await db.$queryRaw<Admission[]>(query);
    if (!result?.authenticated) throw new ClientResolutionError("No autenticado.", 401);
    if (!result.authorized) throw new ClientResolutionError("No tenés acceso a este cliente.", 403);
    if (result.keyMismatch) throw new ClientResolutionError("La solicitud ya se usó para otra operación.", 409);
    if (result.job) return result.job;
    if (!result.owned) throw new ClientResolutionError("Oportunidad no disponible.", 404);
    if (!result.valid) throw new ClientResolutionError("La oportunidad o sus selecciones ya no están disponibles.", 409);
    // A conflicting concurrent insert may commit after this statement's snapshot.
    // Read a new snapshot once; never create a second active request.
  }
  throw new ClientResolutionError("La oportunidad tiene otra solicitud en curso. Actualizá el estado.", 409);
}

export async function currentManualFingerprint(db: PrismaClient, opportunityId: string, clientId: string) {
  const [row] = await db.$queryRaw<{ fingerprint: string }[]>(Prisma.sql`SELECT ${inputFingerprint()} AS fingerprint FROM "Opportunity" o WHERE o.id = ${opportunityId} AND o."clientId" = ${clientId}`);
  return row?.fingerprint;
}
