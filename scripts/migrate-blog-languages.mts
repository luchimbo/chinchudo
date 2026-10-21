// One-time conversion of paired-language drafts into ordinary editorial articles.
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { argentinaDate, shiftDate } from "../src/lib/blog-calendar";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";

const db = new PrismaClient();
const args = process.argv.slice(2), apply = args.includes("--apply") && !args.includes("--dry-run");
const slug = args[args.indexOf("--client") + 1];
const report: Record<string, unknown> = { command: "migrate-blog-languages", date: new Date().toISOString(), channel: "blog", dryRun: !apply, inputsRead: 0, created: 0, discarded: 0, errors: [], backup: [] };
try {
  if (!args.includes("--client") || !slug) throw new Error("Indicá --client con el slug del cliente.");
  const client = await db.client.findUniqueOrThrow({ where: { slug } });
  const rows = await db.landing.findMany({ where: { clientId: client.id, status: "DRAFT" } });
  report.inputsRead = rows.length;
  const entries = rows.flatMap(row => { const content = JSON.parse(row.htmlContent); return content.translations ? [{ row, content }] : []; });
  report.backup = entries.map(({ row }) => row);
  report.candidates = entries.length;
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/blog-language-backup-${Date.now()}.json`, JSON.stringify(report, null, 2));
  if (apply) {
    const category = await db.landingCategory.upsert({ where: { clientId_key: { clientId: client.id, key: "journal" } }, update: {}, create: { clientId: client.id, key: "journal", name: client.name, description: "Journal", url: client.storeUrl, keywords: [client.name, "piano", "practice", "music", "Klavier", "üben"] } });
    const cluster = await db.contentCluster.upsert({ where: { clientId_slug: { clientId: client.id, slug: "journal" } }, update: {}, create: { clientId: client.id, slug: "journal", name: "Journal", description: "" } });
    let day = shiftDate(argentinaDate(), 1);
    for (const { row, content } of entries) {
      let first = true;
      for (const [language, raw] of Object.entries(content.translations)) {
        if (!["es", "en", "de"].includes(language)) continue;
        const text = raw as { title: string; description: string; sections: Array<{ heading: string; paragraphs: string[] }> };
        while (editorialIntentForDate(day) !== "educational" || await db.blogPublication.findUnique({ where: { clientId_scheduledDate: { dailySlot: 0, clientId: client.id, scheduledDate: new Date(`${day}T00:00:00Z`) } } })) day = shiftDate(day, 1);
        const localizedSlug = first ? row.slug : `${row.slug}-${language}`;
        const contentData = {
          slug: localizedSlug, intent: "educational", keyword: text.title.slice(0, 160), h1: text.title, titulo: text.title,
          seo_title: text.title.slice(0, 70), meta_description: text.description.slice(0, 180), hero_lede: text.description,
          direct_answer: text.sections[0]?.paragraphs[0] || text.description,
          sections: text.sections.map(s => ({ h2: s.heading, body: s.paragraphs.join("\n\n") })),
          faqs: [{ q: language === "de" ? "Was ist die Hauptidee dieses Ratgebers?" : "What is the main idea of this guide?", a: text.sections[0]?.paragraphs[0] || text.description }], common_mistakes: [], components: [], steps: [], product_ids: [], primary_category_id: category.key, secondary_category_ids: [],
          brand_solution: { title: language === "de" ? "Instrumente entdecken" : "Explore instruments", body: language === "de" ? `Entdecke [[c:${category.key}|${client.name}]] und prüfe die Angaben zu den einzelnen Instrumenten, bevor du dich entscheidest.` : `Explore [[c:${category.key}|${client.name}]] and check the information about each instrument before choosing.` },
          language, translation_group: row.slug, content_type: "GUIDE", indexing_state: "INDEX", editorial_intent: "educational", cluster_slug: cluster.slug, cluster_name: cluster.name, author_name: `${client.name} Editorial`, source_refs: [],
        };
        await db.$transaction(async tx => {
          const data = { clientId: client.id, slug: localizedSlug, keyword: contentData.keyword, titulo: text.title, seoTitle: contentData.seo_title, seoDescription: contentData.meta_description, htmlContent: JSON.stringify(contentData), contentClusterId: cluster.id, authorName: contentData.author_name, contentType: "GUIDE" as const, indexingState: "INDEX" as const, status: "DRAFT" as const };
          const landing = first ? await tx.landing.update({ where: { id: row.id }, data }) : await tx.landing.create({ data });
          await tx.blogPublication.create({ data: { clientId: client.id, landingId: landing.id, scheduledDate: new Date(`${day}T00:00:00Z`), status: "READY", requiresApproval: false, preparation: { language } } });
        }, { timeout: 30000 });
        report.created = Number(report.created) + 1;
        first = false; day = shiftDate(day, 1);
      }
    }
  }
} catch (error) { report.errors = [String(error)]; process.exitCode = 1; }
finally {
  await mkdir("reports", { recursive: true });
  await writeFile(`reports/blog-language-migration-${Date.now()}.json`, JSON.stringify(report, null, 2));
  const { backup: _backup, ...summary } = report;
  console.log(JSON.stringify(summary, null, 2)); await db.$disconnect();
}
