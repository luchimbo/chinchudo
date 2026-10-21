import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDailyArticlePlan } from "../src/lib/blog-daily-plan.mjs";

const args = process.argv.slice(2);
const option = (name: string) => args[args.indexOf(name) + 1];
const slug = args.includes("--client") ? option("--client") : "";
if (!slug) throw new Error("Indicá --client SLUG.");
const languages = (args.includes("--languages") ? option("--languages") : "en,es,de").split(",");
const count = args.includes("--topics") ? Number(option("--topics")) : 1;
if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("Indicá entre 1 y 10 temas diarios.");
const articlePlan = validateDailyArticlePlan(Array.from({ length: count }, () => languages));
const dryRun = !args.includes("--apply") || args.includes("--dry-run");
const db = new PrismaClient();
const report: Record<string, unknown> = { command: "configure-blog-daily-plan", date: new Date().toISOString(), channel: "blog", client: slug, dryRun, articlePlan, inputsRead: 0, opportunitiesCreated: 0, discarded: 0, errors: [] };
try {
  const client = await db.client.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const key = `blog_daily_schedule:${client.id}`;
  const setting = await db.appSetting.findUnique({ where: { key } });
  const previous = JSON.parse(setting?.value || "{}");
  report.inputsRead = 1;
  report.previous = previous;
  const value = JSON.stringify({ ...previous, articlePlan });
  if (!dryRun) await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  report.result = JSON.parse(value);
  console.log(JSON.stringify({ client: slug, dryRun, articlePlan, articlesPerDay: articlePlan.flat().length, enabled: previous.enabled === true }));
} catch (error) {
  report.errors = [String(error)]; process.exitCode = 1;
  console.error(String(error));
} finally {
  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports", `blog-daily-plan-${Date.now()}.json`), JSON.stringify(report, null, 2));
  await db.$disconnect();
}
