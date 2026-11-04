import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { signJwt } from "../src/lib/auth-crypto";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient(), base = process.env.PERFORMANCE_BASE || "http://localhost:3150";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Local test server required.");
const report: Record<string, unknown> = { command: "verify-cm-admission", at: new Date().toISOString(), base, publishing: false, generation: false };
let clientId: string | undefined, opportunityId: string | undefined;
try {
  // No brands/personas: the worker must reject this disposable tenant before any LLM call.
  const client = await db.client.create({ data: { slug: `perf-verification-${crypto.randomUUID()}`, name: "Disposable performance verification" } });
  clientId = client.id;
  const user = await db.user.create({ data: { clientId: client.id, email: `perf-${crypto.randomUUID()}@example.invalid`, name: "Local verification", passwordHash: crypto.randomUUID() } });
  const channel = await db.channel.findFirstOrThrow({ where: { name: "YouTube" }, select: { id: true } });
  const opportunity = await db.opportunity.create({ data: { clientId: client.id, channelId: channel.id, sourceUrl: `https://example.invalid/${crypto.randomUUID()}`, sourceText: "Local performance verification only" } });
  opportunityId = opportunity.id;
  const token = signJwt({ email: user.email, clientId: client.id, clientSlug: client.slug, tv: user.tokenVersion }, process.env.AUTH_SECRET!, 300);
  const body = JSON.stringify({ client: client.slug, opportunityId: opportunity.id, action: "generate", idempotencyKey: crypto.randomUUID() });
  const request = () => fetch(`${base}/api/cm/jobs`, { method: "POST", headers: { "Content-Type": "application/json", cookie: `auth_session=${token}` }, body });
  const start = performance.now(), response = await request(), job = await response.json();
  report.acceptanceMs = Math.round(performance.now() - start); report.status = response.status;
  if (response.status !== 202) throw new Error("admission_failed");
  const duplicate = await request(); report.idempotent = (await duplicate.json()).id === job.id;
  let state = "QUEUED"; const deadline = Date.now() + 90_000;
  while (["QUEUED", "RUNNING"].includes(state) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = (await db.cMManualJob.findUniqueOrThrow({ where: { id: job.id }, select: { status: true } })).status;
  }
  report.validationFailure = state === "FAILED";
  report.noDrafts = await db.response.count({ where: { opportunityId: opportunity.id } }) === 0;
  if (!report.validationFailure || !report.noDrafts || !report.idempotent) process.exitCode = 1;
} catch (error) { report.error = error instanceof Error ? error.message : "verification_failed"; process.exitCode = 1; }
finally {
  if (clientId && opportunityId) await db.appSetting.deleteMany({ where: { key: `cm.maintenance.error.${clientId}.${opportunityId}` } });
  if (clientId) await db.client.delete({ where: { id: clientId } });
  report.cleanup = "Only the disposable tenant and its cascading verification records were removed.";
  await writeFile("reports/module-performance-admission-verification.json", JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report)); await db.$disconnect();
}
