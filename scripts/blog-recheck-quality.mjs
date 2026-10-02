// Vuelve a correr la revisión editorial sobre los artículos del calendario
// y repone el estado de cada fecha. Uso: node scripts/blog-recheck-quality.mjs [--apply]
import { PrismaClient } from "@prisma/client";
import { editableArticleContent, inspectBlogArticle } from "../src/lib/blog-evidence.mjs";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();
try {
  const client = await prisma.client.findUnique({ where: { slug: "pcmidi" }, select: { id: true } });
  const slots = await prisma.blogPublication.findMany({
    where: { clientId: client.id, status: { in: ["READY", "FAILED"] }, landingId: { not: null } },
    include: { landing: { select: { id: true, htmlContent: true } } },
    orderBy: { scheduledDate: "asc" },
  });
  for (const slot of slots) {
    const stored = JSON.parse(slot.landing.htmlContent);
    const content = editableArticleContent(stored);
    const quality = await inspectBlogArticle(prisma, client.id, content, slot.landing.id);
    const errors = quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ").slice(0, 2000);
    console.log(slot.scheduledDate.toISOString().slice(0, 10), quality.publishable ? "READY " : "FAILED", errors.slice(0, 140));
    if (!apply) continue;
    const updated = stored.pending_revision ? { ...stored, pending_revision: { ...stored.pending_revision, content: { ...content, editorial_quality: quality } } } : { ...content, editorial_quality: quality };
    await prisma.$transaction([
      prisma.landing.update({ where: { id: slot.landing.id }, data: { htmlContent: JSON.stringify(updated) } }),
      prisma.blogPublication.update({ where: { id: slot.id }, data: quality.publishable ? { status: "READY", attempts: 0, lastError: "" } : { status: "FAILED", lastError: errors } }),
    ]);
  }
  console.log(apply ? "Aplicado." : "Simulación: agregá --apply para guardar.");
} finally {
  await prisma.$disconnect();
}
