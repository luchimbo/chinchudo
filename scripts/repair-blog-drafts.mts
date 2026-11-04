import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-ignore shared worker helpers
import { repairBlogContent } from "../src/lib/blog-auto-repair.mjs";
// @ts-ignore shared quality review
import { inspectBlogArticle } from "../src/lib/blog-evidence.mjs";
nextEnv.loadEnvConfig(process.cwd());
const db = new PrismaClient(), apply = process.argv.includes("--apply");
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const slug = process.argv.includes("--client") ? arg("--client") : "pcmidi";
const from = arg("--from"), to = arg("--to");
if (!process.argv.includes("--from") || !process.argv.includes("--to") || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Usá --client SLUG --from AAAA-MM-DD --to AAAA-MM-DD [--apply]. Sin --apply solo verifica.");
const report = { command: "repair-blog-drafts", at: new Date().toISOString(), apply, client: slug, rows: [] as object[] };
try {
  const client = await db.client.findUniqueOrThrow({ where: { slug } });
  const [products, categories, slots] = await Promise.all([
    db.landingProduct.findMany({ where: { clientId: client.id }, select: { externalId: true, name: true, url: true, linkStatus: true, sourceSnapshot: true } }),
    db.landingCategory.findMany({ where: { clientId: client.id }, select: { key: true, name: true, url: true, linkStatus: true } }),
    db.blogPublication.findMany({ where: { clientId: client.id, scheduledDate: { gte: new Date(from), lt: new Date(new Date(to).getTime() + 86400_000) }, status: "FAILED", errorCode: "QUALITY_BLOCKED", requiresApproval: false, landing: { status: { in: ["DRAFT", "APPROVED"] } } }, include: { landing: true }, orderBy: { scheduledDate: "asc" } }),
  ]);
  const candidates = [];
  for (const slot of slots) {
    const original = JSON.parse(slot.landing!.htmlContent);
    const repaired = repairBlogContent(original, { products, categories, clientName: client.name });
    repaired.content.id = slot.landingId;
    const quality = await inspectBlogArticle(db, client.id, repaired.content, slot.landingId);
    if (!quality.publishable) throw new Error(`La revisión sigue rechazando ${slot.id}.`);
    repaired.content.editorial_quality = quality;
    candidates.push({ slot, original, ...repaired });
  }
  if (candidates.length) {
    const python = process.env.AGENTS_PYTHON_BIN || (existsSync(".venv/Scripts/python.exe") ? resolve(".venv/Scripts/python.exe") : "python");
    const code = `import json, sys
sys.path.insert(0, 'landing-build')
sys.path.insert(0, 'agents')
import build_landings as bl
import db_pg
data = json.load(sys.stdin)
bl._CLIENT_CONFIG = db_pg.get_client_config(data['client'])
categories, products = bl.load_categories(), bl.load_products()
existing, clusters = bl.load_landings(), bl.load_content_clusters()
planned = {row.get('id', row.get('slug')): row for row in existing}
planned.update({row.get('id', row.get('slug')): row for row in data['contents']})
pillars = bl.pillar_cluster_slugs(clusters, list(planned.values()))
errors = []
for content in data['contents']:
    bl._GENERATION_LANGUAGE = content.get('language', 'es')
    others = [row for row in existing if row.get('id') != content.get('id')]
    errors += bl.validate_landings([content], categories, products)
    errors += bl.validate_editorial_candidate(content, others, clusters, pillars, categories, products)
print(json.dumps({'errors': errors}))
sys.exit(1 if errors else 0)
`;
    const result = execFileSync(python, ["-c", code], { input: JSON.stringify({ client: slug, contents: candidates.map(c => c.content) }), encoding: "utf8", timeout: 120_000, maxBuffer: 1_000_000 });
    if (!result.includes('"errors": []')) throw new Error("La validación Python no confirmó el resultado.");
  }
  for (const candidate of candidates) {
    const { slot, original, content, changes } = candidate;
    if (apply) await db.$transaction(async tx => {
      const updated = await tx.landing.updateMany({ where: { id: slot.landingId!, clientId: client.id, updatedAt: slot.landing!.updatedAt, status: slot.landing!.status }, data: { htmlContent: JSON.stringify(content) } });
      const queued = await tx.blogPublication.updateMany({ where: { id: slot.id, clientId: client.id, updatedAt: slot.updatedAt, landingId: slot.landingId, status: "FAILED", requiresApproval: false }, data: { status: "READY", attempts: 0, lastError: "", errorCode: "", preparation: { ...(slot.preparation as object || {}), phase: "READY", automaticRecovery: { at: new Date().toISOString(), reason: "catalog_and_structure_repaired", previousError: slot.lastError } } } });
      if (updated.count !== 1 || queued.count !== 1) throw new Error("El artículo cambió durante la reparación. No se guardó el candidato.");
    });
    report.rows.push({ id: slot.id, landingId: slot.landingId, day: slot.scheduledDate.toISOString().slice(0, 10), changes, status: apply ? "READY" : "VERIFIED", nativeValidation: true, original });
  }
} finally {
  mkdirSync("reports", { recursive: true });
  writeFileSync(`reports/blog-auto-repair-${Date.now()}.json`, JSON.stringify(report, null, 2));
  await db.$disconnect();
}
console.info(JSON.stringify({ apply, repaired: report.rows.length, nativeValidation: true }));
