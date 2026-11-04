import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "node:fs/promises";
import { signJwt } from "../src/lib/auth-crypto";
const db = new PrismaClient();
const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") || fallback;
const base = arg("base", "http://localhost:3147"), label = arg("label", "before"), samples = Math.max(30, Number(arg("samples", "30")));
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Benchmark authentication is restricted to a local test server.");
const report: object[] = [];
try {
  const clients = await db.client.findMany({ where: { active: true, ...(arg("client", "") ? { slug: { in: arg("client", "").split(",") } } : {}) }, select: { id: true, slug: true } });
  for (const client of clients) {
    const user = await db.user.findFirst({ where: { clientId: client.id }, select: { email: true, role: true, tokenVersion: true } });
    if (!user || !process.env.AUTH_SECRET) { report.push({ client: client.slug, unavailable: "No local test session available" }); continue; }
    const token = signJwt({ email: user.email, clientSlug: client.slug, clientId: client.id, role: user.role, tv: user.tokenVersion }, process.env.AUTH_SECRET, 3600);
    for (const route of arg("routes", "/asistente-cm,/blog/calendario,/blog/articulos").split(",")) {
      const measurements = [];
      for (let n = 0; n <= samples; n++) {
        const start = performance.now();
        const response = await fetch(`${base}${route}?client=${encodeURIComponent(client.slug)}`, { headers: { cookie: `auth_session=${token}` }, redirect: "manual", signal: AbortSignal.timeout(90_000) });
        const body = await response.arrayBuffer();
        measurements.push({ ms: Math.round(performance.now() - start), bytes: body.byteLength, status: response.status });
      }
      const warm = measurements.slice(1), ordered = warm.map(m => m.ms).sort((a,b) => a-b);
      report.push({ client: client.slug, route, firstRequest: measurements[0], samples: warm, p50: ordered[Math.ceil(ordered.length * .5) - 1], p95: ordered[Math.ceil(ordered.length * .95) - 1], meanBytes: Math.round(warm.reduce((sum,m) => sum + m.bytes, 0) / warm.length) });
      await writeFile(`reports/module-performance-${label}.json`, JSON.stringify({ at: new Date().toISOString(), base, label, measurements: report }, null, 2));
      console.info(`${label}: ${client.slug} ${route} measured (${warm.length} samples)`);
    }
  }
} finally {
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/module-performance-${label}.json`, JSON.stringify({ at: new Date().toISOString(), base, label, measurements: report }, null, 2));
  await db.$disconnect();
}
