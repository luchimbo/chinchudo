import { inspectBlogArticle } from "../src/lib/blog-evidence.mjs";
import { editorialIntentForDate } from "../src/lib/blog-quality.mjs";

const shift = (day, days) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

// Caller holds the blog lease. Only missed articles are moved; empty dates and
// deliberate omissions stay untouched. Optimistic checks protect editor changes.
export async function recoverMissedBlogArticles(prisma, clientId, { today, dryRun = true, inspect = (content, id) => inspectBlogArticle(prisma, clientId, content, id) }) {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { slug: true } });
  if (client.slug !== "pcmidi") throw new Error("La recuperación automática solo corresponde a PC MIDI.");
  const rows = await prisma.blogPublication.findMany({ where: { clientId }, include: { landing: true }, orderBy: { scheduledDate: "asc" } });
  const occupied = new Map(rows.map(row => [row.scheduledDate.toISOString().slice(0, 10), row]));
  const report = [];
  for (const slot of rows) {
    const day = slot.scheduledDate.toISOString().slice(0, 10);
    if (day > today || !slot.landing || !["READY", "SKIPPED", "FAILED"].includes(slot.status)) continue;
    if (["PUBLISHED", "ARCHIVED"].includes(slot.landing.status)) continue;
    let content, quality;
    try {
      content = JSON.parse(slot.landing.htmlContent);
      if (slot.landing.slug.startsWith("ejemplo-calendario-")) throw new Error("Los datos de ejemplo no pueden publicarse.");
      if (!["educational", "decision"].includes(content.editorial_intent)) throw new Error("Falta un tipo editorial válido.");
      quality = await inspect(content, slot.landing.id);
      if (!quality.publishable) throw new Error(quality.checks.filter(c => c.level === "error").map(c => c.message).join(" · "));
    } catch (error) {
      const lastError = String(error.message || error).slice(0, 1000);
      if (!dryRun) await prisma.blogPublication.updateMany({ where: { id: slot.id, updatedAt: slot.updatedAt, landing: { updatedAt: slot.landing.updatedAt } }, data: { status: "FAILED", lastError, attempts: 3 } });
      report.push({ id: slot.id, from: day, status: "BLOCKED", error: lastError });
      continue;
    }
    let target = shift(today, 1);
    if (editorialIntentForDate(target) !== content.editorial_intent) target = shift(target, 1);
    while (occupied.has(target) && (occupied.get(target).landingId || occupied.get(target).status !== "PLANNED" || occupied.get(target).analysisRunId)) target = shift(target, 2);
    const destination = occupied.get(target);
    if (!dryRun) await prisma.$transaction(async tx => {
      if (destination) {
        const deleted = await tx.blogPublication.deleteMany({ where: { id: destination.id, updatedAt: destination.updatedAt, landingId: null, analysisRunId: null, status: "PLANNED" } });
        if (deleted.count !== 1) throw new Error("El calendario cambió durante la recuperación. Reintentá.");
      }
      const changed = await tx.blogPublication.updateMany({ where: { id: slot.id, updatedAt: slot.updatedAt, status: slot.status, landing: { updatedAt: slot.landing.updatedAt } }, data: { scheduledDate: new Date(`${target}T00:00:00Z`), status: "READY", attempts: 0, lastError: "" } });
      if (changed.count !== 1) throw new Error("El artículo cambió durante la recuperación. Reintentá.");
      await tx.landing.update({ where: { id: slot.landingId }, data: { status: "DRAFT", publishedAt: null, htmlContent: JSON.stringify({ ...content, editorial_quality: quality }) } });
    });
    occupied.set(target, slot);
    report.push({ id: slot.id, from: day, to: target, status: dryRun ? "WOULD_RECOVER" : "RECOVERED" });
  }
  return report;
}
