import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { signJwt } from "../src/lib/auth-crypto";
nextEnv.loadEnvConfig(process.cwd());
const base = process.env.PERFORMANCE_BASE || "http://localhost:3152";
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Local server required");
const db = new PrismaClient(), samples: number[] = [];
let clientId: string | undefined;
try {
  const client = await db.client.create({ data: { slug: `perf-admission-${crypto.randomUUID()}`, name: "Disposable admission benchmark" } });
  clientId = client.id;
  const user = await db.user.create({ data: { clientId, email: `${crypto.randomUUID()}@example.invalid`, name: "Benchmark", passwordHash: crypto.randomUUID() } });
  const channel = await db.channel.findFirstOrThrow({ where: { name: "YouTube" }, select: { id: true } });
  const ids = Array.from({ length: 31 }, () => crypto.randomUUID());
  await db.opportunity.createMany({ data: ids.map(id => ({ id, clientId, channelId: channel.id, sourceText: "Verification only: no configured brand or persona", sourceUrl: `https://example.invalid/${id}` })) });
  const token = signJwt({ email: user.email, clientId, clientSlug: client.slug, tv: user.tokenVersion }, process.env.AUTH_SECRET!, 1800);
  const post = (body: object, cookie = token) => fetch(`${base}/api/cm/jobs`, { method: "POST", headers: { "Content-Type": "application/json", cookie: `auth_session=${cookie}` }, body: JSON.stringify(body) });
  const input = (opportunityId: string) => ({ client: client.slug, opportunityId, action: "generate", idempotencyKey: crypto.randomUUID() });
  const revoked = signJwt({ email: user.email, clientId, clientSlug: client.slug, tv: user.tokenVersion + 1 }, process.env.AUTH_SECRET!, 1800);
  if ((await post(input(ids[0]), revoked)).status !== 401) throw new Error("Revoked token accepted");
  if ((await post({ ...input(ids[0]), client: "pcmidi" })).status !== 403) throw new Error("Foreign tenant accepted");
  if (await db.cMManualJob.count({ where: { clientId } })) throw new Error("Rejected requests created jobs");
  for (const id of ids) {
    const started = performance.now(), response = await post(input(id));
    await response.json();
    if (response.status !== 202) throw new Error(`admission_status_${response.status}`);
    samples.push(Math.round(performance.now() - started));
  }
  const warm = samples.slice(1).sort((a,b) => a-b);
  const report = { at: new Date().toISOString(), base, firstRequestMs: samples[0], samples: samples.slice(1), p50: warm[14], p95: warm[28],
    revokedTokenRejected: true, foreignTenantRejected: true, draftsCreated: await db.response.count({ where: { opportunity: { clientId } } }),
    note: "31 distinct fresh requests; disposable tenant has no brands/personas, so no LLM or publishing path is available." };
  await writeFile("reports/module-performance-admission-benchmark.json", JSON.stringify(report, null, 2));
  console.info(JSON.stringify({ p50: report.p50, p95: report.p95, samples: warm.length, draftsCreated: report.draftsCreated }));
} finally {
  if (clientId) {
    const opportunities = await db.opportunity.findMany({ where: { clientId }, select: { id: true } });
    await db.appSetting.deleteMany({ where: { key: { in: opportunities.map(o => `cm.maintenance.error.${clientId}.${o.id}`) } } });
    await db.client.delete({ where: { id: clientId } });
  }
  await db.$disconnect();
}
