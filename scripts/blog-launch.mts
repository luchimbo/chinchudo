import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { recoverMissedBlogArticles } from "./blog-recovery.mjs";
import { withBlogLease } from "./blog-lease.mjs";
import { argentinaDate, shiftDate, dateOnly } from "../src/lib/blog-calendar";
import { inspectBlogArticle } from "../src/lib/blog-evidence";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const s = line.trim(); if (!s || s.startsWith("#")) continue;
  const n = s.indexOf("="); if (n < 0) continue;
  const key = s.slice(0, n).trim().replace(/^\uFEFF/, "");
  if (!(key in process.env)) process.env[key] = s.slice(n + 1).trim().replace(/^["']|["']$/g, "");
}
const dryRun = process.argv.includes("--dry-run");
const activate = process.argv.includes("--activate");
if (!dryRun && !activate && !process.argv.includes("--recover")) throw new Error("Usá --dry-run, --recover o --activate.");
const prisma = new PrismaClient();
const today = argentinaDate(), tomorrow = shiftDate(today, 1);
const report: Record<string, any> = { command: "blog-launch", timestamp: new Date().toISOString(), client: "pcmidi", dryRun, entries: [], errors: [], activated: false };
try {
  const client = await prisma.client.findUniqueOrThrow({ where: { slug: "pcmidi" } });
  const run = async () => {
    report.entries = await recoverMissedBlogArticles(prisma, client.id, { today, dryRun });
    if (!activate || dryRun) return;
    if (!client.active || !client.blogBaseUrl) throw new Error("Falta el cliente activo o la URL pública del blog.");
    const relay = await fetch(`http://127.0.0.1:${process.env.AGENT_RELAY_PORT || "3099"}/health`, { signal: AbortSignal.timeout(5_000) });
    if (!relay.ok) throw new Error("El agente local no está disponible.");
    if ((await relay.json()).blogAutomationVersion !== 2) throw new Error("Reiniciá el agente local para cargar la nueva automatización antes de activar.");
    const publicSite = await fetch(client.blogBaseUrl, { signal: AbortSignal.timeout(20_000) });
    if (!publicSite.ok) throw new Error("El sitio público no está disponible.");
    const next = await prisma.blogPublication.findUnique({ where: { clientId_scheduledDate: { clientId: client.id, scheduledDate: dateOnly(tomorrow) } }, include: { landing: true } });
    if (!next?.landing || next.status !== "READY") throw new Error(`No hay un artículo listo para ${tomorrow}. Corregilo antes de activar.`);
    const content = JSON.parse(next.landing.htmlContent);
    const quality = await inspectBlogArticle(prisma, client.id, content, next.landingId!);
    if (!quality.publishable || next.landing.slug.startsWith("ejemplo-calendario-") || content.editorial_intent !== editorialIntentForDate(tomorrow)) throw new Error("El primer artículo no pasa los controles editoriales.");
    const catalog = await prisma.catalogSyncRun.findFirst({ where: { clientId: client.id }, orderBy: { startedAt: "desc" } });
    if (!catalog || !["COMPLETED", "PARTIAL"].includes(catalog.status) || !(catalog.deployment as any)?.verified) throw new Error("Verificá el despliegue del catálogo antes de activar.");
    const key = `blog_daily_schedule:${client.id}`;
    const previous = await prisma.appSetting.findUnique({ where: { key } });
    const config = JSON.parse(previous?.value || "{}");
    report.previousConfig = config;
    // Repeating activation never postpones the start date.
    const value = JSON.stringify({ ...config, enabled: true, autoApprove: true, preparing: false, publishTime: "12:00", firstPublishDate: config.enabled ? config.firstPublishDate || tomorrow : tomorrow, timezone: "America/Argentina/Buenos_Aires", horizonDays: 14 });
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    report.activated = true; report.config = JSON.parse(value);
  };
  if (dryRun) await run();
  else if (await withBlogLease(prisma, client.id, async () => { await run(); return true; }) === null) throw new Error("El blog está ocupado. Reintentá al terminar la ejecución actual.");
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  mkdirSync("reports", { recursive: true });
  const path = `reports/blog-launch-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, report: path }, null, 2));
  await prisma.$disconnect();
}
