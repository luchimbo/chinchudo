import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
import { signJwt } from "../src/lib/auth-crypto";
nextEnv.loadEnvConfig(process.cwd());
const before = process.env.PERFORMANCE_BEFORE || "http://localhost:3153";
const after = process.env.PERFORMANCE_BASE || "http://localhost:3152";
for (const base of [before, after]) if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Local servers required");
const db = new PrismaClient();
type Sample = { ms: number; bytes: number; ttfbMs: number };
const report: { client: string; route: string; before: Sample[]; after: Sample[]; summary?: object }[] = [];
const percentile = (samples: Sample[], key: "ms" | "ttfbMs", p: number) => samples.map(s => s[key]).sort((a,b) => a-b)[Math.ceil(samples.length * p)-1];
try {
  const clients = await db.client.findMany({ where: { active: true, slug: { in: (process.env.PERFORMANCE_CLIENTS || "pcmidi,prestige-running,jurispedia,kressmer").split(",") } }, select: { id: true, slug: true }, orderBy: { slug: "asc" } });
  clients.sort((a,b) => Number(b.slug === "pcmidi") - Number(a.slug === "pcmidi"));
  for (const client of clients) {
    const user = await db.user.findFirst({ where: { clientId: client.id }, select: { email: true, tokenVersion: true } });
    if (!user) continue;
    const token = signJwt({ email: user.email, clientId: client.id, clientSlug: client.slug, tv: user.tokenVersion }, process.env.AUTH_SECRET!, 7200);
    const sampleCount = client.slug === "pcmidi" ? 30 : Math.max(5, Number(process.env.PERFORMANCE_OTHER_SAMPLES || 30));
    for (const route of ["/asistente-cm", "/blog/calendario", "/blog/articulos"]) {
      const entry = { client: client.slug, route, before: [] as Sample[], after: [] as Sample[] }; report.push(entry);
      for (let n = 0; n <= sampleCount; n++) {
        // Alternate the order, with one HTTP request at a time, to avoid making
        // network drift or competing benchmark pools look like code regressions.
        for (const side of n % 2 ? ["after", "before"] as const : ["before", "after"] as const) {
          const start = performance.now();
          const response = await fetch(`${side === "before" ? before : after}${route}?client=${client.slug}`, { redirect: "manual", headers: { cookie: `auth_session=${token}` }, signal: AbortSignal.timeout(60_000) });
          const ttfbMs = Math.round(performance.now()-start), body = await response.arrayBuffer();
          if (response.status !== 200) throw new Error(`${side}:${client.slug}:${route}:HTTP_${response.status}`);
          if (n) entry[side].push({ ms: Math.round(performance.now()-start), ttfbMs, bytes: body.byteLength });
        }
      }
      const beforeP95 = percentile(entry.before,"ms",.95), afterP95 = percentile(entry.after,"ms",.95);
      const bytes = (s: Sample[]) => Math.round(s.reduce((sum,row) => sum+row.bytes,0)/s.length);
      Object.assign(entry, { summary: { beforeP95, afterP95, samplesPerSide: sampleCount, preliminary: sampleCount < 30, improvementPercent: Math.round((1-afterP95/beforeP95)*100), beforeBytes: bytes(entry.before), afterBytes: bytes(entry.after),
        beforeMedian: percentile(entry.before,"ms",.5), afterMedian: percentile(entry.after,"ms",.5), beforeTtfbP95: percentile(entry.before,"ttfbMs",.95), afterTtfbP95: percentile(entry.after,"ttfbMs",.95) } });
      await writeFile("reports/module-performance-comparison.json", JSON.stringify({ at: new Date().toISOString(), before, after, method: "Serial alternating pairs; 1 warmup, 30 samples per main PC MIDI screen; other-client sample counts are explicit and marked preliminary below 30.", measurements: report }, null, 2));
      console.info(JSON.stringify({ client: client.slug, route, ...entry.summary }));
    }
  }
} finally { await db.$disconnect(); }
