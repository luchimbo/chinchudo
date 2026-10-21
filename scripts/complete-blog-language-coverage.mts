import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { articleLanguageInfo } from "../src/lib/blog-translations.js";
import { BLOG_LANGUAGES } from "../src/lib/blog-language.js";

const args = process.argv.slice(2);
const slug = args.includes("--client") ? args[args.indexOf("--client") + 1] : "kressmer";
const apply = args.includes("--apply") && !args.includes("--dry-run");
const targets = ["es", "en", "de"] as const;
const python = process.env.AGENTS_PYTHON_BIN || (existsSync(resolve(".venv/Scripts/python.exe")) ? resolve(".venv/Scripts/python.exe") : "python");
const db = new PrismaClient();
const report = { command: "complete-blog-language-coverage", date: new Date().toISOString(), channel: "blog", client: slug, dryRun: !apply, inputsRead: 0, created: 0, discarded: 0, errors: [] as Array<{ articleId: string; language: string; message: string }>, articles: [] as Array<Record<string, unknown>> };

function translate(articleId: string, language: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(python, [resolve("landing-build/build_landings.py"), "--client-slug", slug, "translate", "--landing-id", articleId, "--language", language], {
      cwd: resolve("."), windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", BLOG_PREPARATION_ATTEMPT_ID: "", BLOG_DAILY_SLOT: "0" },
    });
    let output = "";
    child.stdout.on("data", part => { output = (output + part.toString()).slice(-6000); });
    child.stderr.on("data", part => { output = (output + part.toString()).slice(-6000); });
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolvePromise() : reject(new Error(output.slice(-1200) || `El traductor terminó con código ${code}.`)));
  });
}

try {
  const client = await db.client.findUniqueOrThrow({ where: { slug }, select: { id: true, blogBaseUrl: true } });
  const rows = await db.landing.findMany({
    where: { clientId: client.id, contentType: { in: ["GUIDE", "PILLAR"] }, status: { in: ["DRAFT", "PUBLISHED"] } },
    select: { id: true, titulo: true, status: true, htmlContent: true, blogPublication: { select: { status: true } } },
    orderBy: { createdAt: "asc" },
  });
  const originals = rows.filter(row => !articleLanguageInfo(row.htmlContent).translationOf && row.blogPublication?.status !== "SKIPPED");
  report.inputsRead = rows.length;
  const jobs: Array<{ articleId: string; title: string; sourceStatus: string; language: string }> = [];
  for (const article of originals) {
    const info = articleLanguageInfo(article.htmlContent);
    const versions = await db.landing.findMany({
      where: { clientId: client.id, OR: [
        { htmlContent: { contains: `"translation_of":"${article.id}"` } },
        { htmlContent: { contains: `"translation_of": "${article.id}"` } },
      ] },
      select: { htmlContent: true },
    });
    const existing = new Set([info.language, ...versions.flatMap(version => {
      const candidate = articleLanguageInfo(version.htmlContent);
      try { const content = JSON.parse(version.htmlContent); return candidate.translationOf === article.id ? [candidate.language] : []; } catch { return []; }
    })]);
    const missing = targets.filter(language => !existing.has(language));
    report.articles.push({ id: article.id, title: article.titulo, status: article.status, sourceLanguage: info.language, existingLanguages: [...existing], missingLanguages: missing });
    for (const language of missing) jobs.push({ articleId: article.id, title: article.titulo, sourceStatus: article.status, language });
  }
  console.log(JSON.stringify({ client: slug, dryRun: !apply, articles: originals.length, translationsToCreate: jobs.length, jobs }));
  if (apply) {
    for (const job of jobs) {
      try {
        await translate(job.articleId, job.language);
        report.created += 1;
        console.log(`Traducción lista: ${job.language} · ${job.title}`);
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error).slice(-1200);
        report.errors.push({ articleId: job.articleId, language: job.language, message });
        console.error(`Falló ${job.language} · ${job.title}: ${message}`);
      }
      writeFileSync(resolve("reports", `blog-language-coverage-${Date.now()}.json`), JSON.stringify(report, null, 2));
    }
    if (report.errors.length) process.exitCode = 1;
  }
} catch (error) {
  report.errors.push({ articleId: "", language: "", message: String(error instanceof Error ? error.message : error) });
  process.exitCode = 1;
  console.error(String(error));
} finally {
  mkdirSync(resolve("reports"), { recursive: true });
  writeFileSync(resolve("reports", `blog-language-coverage-${Date.now()}.json`), JSON.stringify(report, null, 2));
  await db.$disconnect();
}
