import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { claimYouTubePublication, clearYouTubePublication, markYouTubePublicationAmbiguous } from "../src/lib/cm-action-guard";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient(), checks: string[] = [];
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); checks.push(message); };
try {
  await db.$transaction(async tx => {
    const client = await tx.client.create({ data: { name: `Publication verification ${crypto.randomUUID()}`, slug: `pub-verification-${crypto.randomUUID()}` } });
    const channel = await tx.channel.findFirstOrThrow({ where: { name: "YouTube" }, select: { id: true } });
    const opportunity = await tx.opportunity.create({ data: { clientId: client.id, channelId: channel.id, sourceUrl: `https://example.invalid/${crypto.randomUUID()}`, sourceText: "Rollback-only publication guard verification" } });
    const connection = tx as unknown as PrismaClient;
    const attempt = await claimYouTubePublication(connection, client.id, opportunity.id);
    assert(typeof attempt === "string", "intent persisted before any external request");
    assert(!await claimYouTubePublication(connection, client.id, opportunity.id), "double click cannot claim twice");
    assert(!await claimYouTubePublication(connection, "foreign-client", opportunity.id), "foreign tenant cannot claim");
    assert(!await clearYouTubePublication(connection, client.id, opportunity.id), "operator cannot unlock an in-flight request");
    assert(!await clearYouTubePublication(connection, "foreign-client", opportunity.id, attempt!), "foreign tenant cannot unlock");
    await markYouTubePublicationAmbiguous(connection, client.id, opportunity.id, attempt!);
    assert(await clearYouTubePublication(connection, client.id, opportunity.id), "ambiguous attempt can be unlocked after human verification");
    const next = await claimYouTubePublication(connection, client.id, opportunity.id);
    assert(next && next !== attempt, "retry has a distinct fencing token");
    assert(!await clearYouTubePublication(connection, client.id, opportunity.id, attempt!), "old request cannot clear a new attempt");
    await markYouTubePublicationAmbiguous(connection, client.id, opportunity.id, attempt!);
    assert(!await clearYouTubePublication(connection, client.id, opportunity.id), "old ambiguity cannot unlock a new in-flight attempt");
    assert(await clearYouTubePublication(connection, client.id, opportunity.id, next!), "definite rejection can clear its own attempt");
    await tx.opportunity.update({ where: { id: opportunity.id }, data: { status: "PUBLISHED" } });
    assert(!await claimYouTubePublication(connection, client.id, opportunity.id), "closed opportunity cannot be published again");
    throw new Error("ROLLBACK_PUBLICATION_VERIFICATION");
  }, { timeout: 60_000, maxWait: 10_000 });
} catch (error) {
  if (!(error instanceof Error) || error.message !== "ROLLBACK_PUBLICATION_VERIFICATION") throw error;
} finally {
  await writeFile("reports/module-performance-publication-guard.json", JSON.stringify({ at: new Date().toISOString(), checks, publishing: false, rolledBack: true }, null, 2));
  await db.$disconnect();
}
console.info(JSON.stringify({ checks: checks.length, publishing: false, rolledBack: true }));
