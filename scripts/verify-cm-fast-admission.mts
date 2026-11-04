import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { fastManualAdmission, currentManualFingerprint } from "../src/lib/cm-fast-admission";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient(), checks: string[] = [];
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); checks.push(message); };
try {
  await db.$transaction(async tx => {
    const client = await tx.client.create({ data: { slug: `perf-atomic-${crypto.randomUUID()}`, name: "Atomic verification" } });
    const user = await tx.user.create({ data: { clientId: client.id, email: `${crypto.randomUUID()}@example.invalid`, name: "Verification", passwordHash: crypto.randomUUID() } });
    const channel = await tx.channel.findFirstOrThrow({ where: { name: "YouTube" }, select: { id: true } });
    const opportunity = await tx.opportunity.create({ data: { clientId: client.id, channelId: channel.id, sourceUrl: `https://example.invalid/${crypto.randomUUID()}`, sourceText: "Atomic verification only" } });
    const input = { client: client.slug, opportunityId: opportunity.id, action: "generate" as const, idempotencyKey: crypto.randomUUID() };
    const claims = { email: user.email, tokenVersion: user.tokenVersion };
    const connection = tx as unknown as PrismaClient;
    for (const [override, status] of [[{ ...claims, tokenVersion: user.tokenVersion + 1 }, 401], [{ ...claims, email: "absent@example.invalid" }, 401]] as const) {
      try { await fastManualAdmission(connection, override, input); throw new Error("accepted_invalid_session"); }
      catch (error) { assert((error as { status?: number }).status === status, "revoked or absent user rejected"); }
    }
    try { await fastManualAdmission(connection, claims, { ...input, client: "pcmidi" }); throw new Error("accepted_foreign_tenant"); }
    catch (error) { assert((error as { status?: number }).status === 403, "foreign tenant rejected"); }
    const job = await fastManualAdmission(connection, claims, input);
    const stored = await tx.cMManualJob.findUniqueOrThrow({ where: { id: job.id } });
    assert(stored.requestedBy === user.email && stored.clientId === client.id, "authority persisted from database");
    assert(stored.inputVersion === await currentManualFingerprint(connection, opportunity.id, client.id), "admission and worker fingerprints match");
    await tx.client.update({ where: { id: client.id }, data: { responsePolicy: "Changed while queued" } });
    assert(stored.inputVersion !== await currentManualFingerprint(connection, opportunity.id, client.id), "context changes while queued invalidate admission");
    await tx.client.update({ where: { id: client.id }, data: { responsePolicy: client.responsePolicy } });
    assert((await fastManualAdmission(connection, claims, input)).id === job.id, "idempotent request returns the same job");
    assert((await fastManualAdmission(connection, claims, { ...input, idempotencyKey: crypto.randomUUID() })).id === job.id, "one active job per opportunity");
    try { await fastManualAdmission(connection, claims, { ...input, opportunityId: "different-opportunity" }); throw new Error("accepted_reused_key"); }
    catch (error) { assert((error as { status?: number }).status === 409, "idempotency key cannot change opportunity"); }
    await tx.opportunity.update({ where: { id: opportunity.id }, data: { sourceText: "Changed after admission" } });
    assert(stored.inputVersion !== await currentManualFingerprint(connection, opportunity.id, client.id), "changed input invalidates the queued fingerprint");
    throw new Error("ROLLBACK_VERIFICATION");
  }, { maxWait: 10_000, timeout: 60_000 });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "ROLLBACK_VERIFICATION") { process.exitCode = 1; throw error; }
} finally {
  await writeFile("reports/module-performance-fast-admission.json", JSON.stringify({ at: new Date().toISOString(), checks, rolledBack: true }, null, 2));
  await db.$disconnect();
}
console.info(JSON.stringify({ checks: checks.length, rolledBack: true }));
