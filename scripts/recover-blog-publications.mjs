// Preview first; --apply prepares recovery, --publish also publishes valid articles.
import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBlogDaily } from "./blog-daily.mjs";
import { withBlogLease } from "./blog-lease.mjs";
import { inspectBlogArticle } from "../src/lib/blog-evidence.mjs";
import { terminateChild } from "./terminate-child.mjs";

const args = process.argv.slice(2), slug = args[args.indexOf("--client") + 1];
if (!args.includes("--client") || !slug || slug.startsWith("--")) throw new Error("Indicá --client SLUG.");
const apply = args.includes("--apply") && !args.includes("--dry-run");
const db = new PrismaClient(), root = resolve(import.meta.dirname, "..");
const report = { command: "recover-blog-publications", date: new Date().toISOString(), channel: "blog", client: slug, dryRun: !apply, inputsRead: 0, opportunitiesCreated: 0, discarded: 0, duplicates: [], articles: [], errors: [] };
mkdirSync(resolve(root, "reports"), { recursive: true });
const reportPath = resolve(root, "reports", `blog-recovery-${Date.now()}.json`);
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2));
const parse = row => JSON.parse(row.htmlContent || "{}");
const python = process.env.AGENTS_PYTHON_BIN || (existsSync(resolve(root, ".venv/Scripts/python.exe")) ? resolve(root, ".venv/Scripts/python.exe") : "python");
async function runPython(params, clientId, timeout = 300000) {
  return new Promise((accept, reject) => {
    const child = spawn(python, [resolve(root, "landing-build/build_landings.py"), "--client-slug", slug, ...params], { cwd: root, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8", LANDING_EXPECTED_CLIENT_ID: clientId } });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output = (output + data.toString()).slice(-10000); });
    const timer = setTimeout(() => terminateChild(child), timeout);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("close", code => { clearTimeout(timer); code === 0 ? accept(output) : reject(new Error(output.slice(-2000))); });
  });
}
try {
  const client = await db.client.findUniqueOrThrow({ where: { slug } });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: client.responsePolicy?.businessMarket?.timezone || "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const execute = async lease => {
    const key = `blog_daily_schedule:${client.id}`;
    const setting = await db.appSetting.findUnique({ where: { key } });
    const config = JSON.parse(setting?.value || "{}");
    if (!config.enabled || !client.blogBaseUrl) throw new Error("La publicación debe estar habilitada y tener URL pública.");
    const all = await db.landing.findMany({ where: { clientId: client.id, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] } }, orderBy: { createdAt: "asc" } });
    const slots = await db.blogPublication.findMany({ where: { clientId: client.id, scheduledDate: { lte: new Date(`${today}T00:00:00Z`), ...(config.firstPublishDate ? { gte: new Date(`${config.firstPublishDate}T00:00:00Z`) } : {}) }, status: { in: ["READY", "FAILED", "SKIPPED"] }, landingId: { not: null } }, include: { landing: true }, orderBy: { scheduledDate: "asc" } });
    report.inputsRead = all.length + slots.length;
    const groups = new Map();
    for (const row of all) {
      const c = parse(row);
      if (!c.translation_of) continue;
      const group = `${c.translation_of}:${c.language}`;
      const versions = groups.get(group) || [];
      versions.push(row); groups.set(group, versions);
    }
    const duplicates = [];
    for (const versions of groups.values()) {
      versions.sort((a, b) => Number(b.status === "PUBLISHED") - Number(a.status === "PUBLISHED") || a.createdAt - b.createdAt);
      for (const row of versions.slice(1)) {
        // Never archive a separately scheduled article or an already public URL.
        if (row.status === "PUBLISHED" || await db.blogPublication.findFirst({ where: { landingId: row.id } })) continue;
        duplicates.push(row);
        report.duplicates.push({ archivedId: row.id, retainedId: versions[0].id, title: row.titulo });
      }
    }
    if (apply) {
      writeFileSync(reportPath.replace(".json", "-backup.json"), JSON.stringify({ setting, slots, landings: all }, null, 2));
      for (const row of duplicates) {
        lease.assert();
        const changed = await db.landing.updateMany({ where: { id: row.id, updatedAt: row.updatedAt, status: row.status }, data: { status: "ARCHIVED" } });
        if (changed.count !== 1) throw new Error("Una traducción cambió durante la recuperación.");
      }
      const value = JSON.stringify({ ...config, articlePlan: [["es", "en", "de"]], catchUpMissed: true, timezone: "America/Argentina/Buenos_Aires" });
      await db.appSetting.update({ where: { key }, data: { value } });
    }
    const worker = createBlogDaily({ prisma: db, targetClientSlug: slug, runBlogPython: runPython, withLease: (id, fn) => withBlogLease(db, id, fn) });
    for (const slot of slots) {
      if (slot.status === "SKIPPED" && !slot.lastError.includes("La fecha pasó sin publicación")) continue;
      const entry = { id: slot.id, day: slot.scheduledDate.toISOString().slice(0, 10), title: slot.landing.titulo, previousStatus: slot.status, status: "PREVIEW", urls: [] };
      report.articles.push(entry); save();
      if (!apply) { entry.requiresApproval = slot.requiresApproval; continue; }
      try {
        lease.assert();
        if (slot.requiresApproval) throw new Error("Pendiente de aprobación humana.");
        const original = parse(slot.landing);
        for (const language of ["es", "en", "de"]) {
          if ((original.language || "es") === language) continue;
          console.log(`Preparando ${entry.day}: ${language}`);
          await runPython(["translate", "--landing-id", slot.landingId, "--language", language], client.id);
          lease.assert();
        }
        const versions = await db.landing.findMany({ where: { clientId: client.id, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] }, OR: [{ id: slot.landingId }, { htmlContent: { contains: `"translation_of":"${slot.landingId}"` } }, { htmlContent: { contains: `"translation_of": "${slot.landingId}"` } }] } });
        for (const version of versions) {
          const quality = await inspectBlogArticle(db, client.id, parse(version), version.id);
          if (!quality.publishable) throw Object.assign(new Error(quality.checks.filter(c => c.level === "error").map(c => c.message).join(" · ")), { code: "QUALITY_BLOCKED" });
        }
        const preparation = { ...slot.preparation, dailyLanguages: ["es", "en", "de"], recovery: { requestedAt: report.date, originalDate: entry.day, previousStatus: slot.status, previousError: slot.lastError } };
        const changed = await db.blogPublication.updateMany({ where: { id: slot.id, updatedAt: slot.updatedAt, status: slot.status, requiresApproval: false }, data: { preparation, status: "READY", attempts: 0, lastError: "", errorCode: "" } });
        if (changed.count !== 1) throw new Error("El artículo cambió durante la recuperación.");
        entry.status = "READY";
        if (args.includes("--publish")) {
          const fresh = await db.blogPublication.findUniqueOrThrow({ where: { id: slot.id } });
          console.log(`Publicando ${entry.day}: ${entry.title}`);
          await worker.publishBlogArticle({ id: slot.id, clientId: client.id, expectedUpdatedAt: fresh.updatedAt.toISOString() });
          const result = await db.blogPublication.findUniqueOrThrow({ where: { id: slot.id } });
          entry.status = result.status;
          if (result.status !== "PUBLISHED") throw new Error(result.lastError || "La publicación no se completó.");
          entry.urls = (await db.landing.findMany({ where: { id: { in: versions.map(v => v.id) } }, select: { publicPreviewUrl: true } })).map(v => v.publicPreviewUrl);
        }
      } catch (error) {
        entry.status = "BLOCKED"; entry.error = String(error.message || error);
        report.errors.push({ id: slot.id, message: entry.error });
        if (error.code === "QUALITY_BLOCKED") await db.blogPublication.updateMany({ where: { id: slot.id, status: { in: ["READY", "SKIPPED", "FAILED"] } }, data: { status: "FAILED", attempts: 3, lastError: entry.error.slice(0, 1000), errorCode: "QUALITY_BLOCKED" } });
        console.error(entry.error);
      }
      save();
    }
    lease?.assert();
    return true;
  };
  let result;
  const deadline = Date.now() + 120000;
  do {
    result = apply ? await withBlogLease(db, client.id, execute) : await execute();
    if (result !== null || Date.now() >= deadline) break;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 5000));
  } while (true);
  if (result === null) throw new Error("El blog está ocupado. Reintentá cuando termine la tarea activa.");
} catch (error) { report.errors.push({ message: String(error.message || error) }); }
finally { save(); await db.$disconnect(); }
console.log(JSON.stringify({ report: reportPath, ...report }));
if (report.errors.length) process.exitCode = 1;
