import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { argentinaDate, dateOnly, shiftDate } from "./blog-calendar";
import { loadBlogEvidence } from "./blog-evidence";
import { editorialIntentForDate, reviewArticle } from "./blog-quality.mjs";

export async function checkInitialBlogBatch(prisma: PrismaClient, clientId: string, start: string) {
  if (start <= argentinaDate()) throw new Error("Las fechas de la tanda ya pasaron. Reprogramá los artículos antes de revisarla.");
  const slots = await prisma.blogPublication.findMany({ where: { clientId, scheduledDate: { gte: dateOnly(start), lt: dateOnly(shiftDate(start, 14)) } }, include: { landing: true }, orderBy: { scheduledDate: "asc" } });
  if (slots.length !== 14 || slots.some((s) => s.status !== "READY" || !s.landing || s.landing.slug.startsWith("ejemplo-calendario-"))) throw new Error("La tanda necesita 14 borradores reales listos, sin fechas omitidas ni errores.");
  const [evidence, rows] = await Promise.all([loadBlogEvidence(prisma, clientId), prisma.landing.findMany({ where: { clientId, status: { in: ["DRAFT", "APPROVED", "PUBLISHED"] } }, select: { id: true, keyword: true, titulo: true, seoTitle: true, seoDescription: true, contentType: true } })]);
  const existing = rows.map((r) => ({ id: r.id, keyword: r.keyword, h1: r.titulo, seo_title: r.seoTitle, meta_description: r.seoDescription, content_type: r.contentType }));
  for (const slot of slots) {
    const content = JSON.parse(slot.landing!.htmlContent);
    if (content.editorial_intent !== editorialIntentForDate(slot.scheduledDate.toISOString().slice(0, 10))) throw new Error("Reprogramá las fechas para conservar siete artículos educativos y siete de elección.");
    const quality = reviewArticle({ ...evidence, content: { ...content, id: slot.landingId }, existing: existing.filter((r) => r.id !== slot.landingId) });
    if (!quality.publishable) throw new Error(`${slot.landing!.titulo}: ${quality.checks.filter((c) => c.level === "error").map((c) => c.message).join(" · ")}`);
  }
  return createHash("sha256").update(JSON.stringify(slots.map((s) => [s.id, s.scheduledDate, s.landingId, s.landing!.updatedAt]))).digest("hex");
}
