import { prisma } from "@/lib/db";

export type StudioCounts = { inspiracion: number; plan: number; guiones: number; publicar: number; resultados: number };

/** Pendientes por paso, para los contadores de la barra del Estudio. */
export async function studioCounts(clientId: string): Promise<StudioCounts> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [references, toReview, toWrite, scriptsToReview, toPublish] = await Promise.all([
    // Solo las referencias nuevas que destacan de verdad (le fue 3 veces mejor que a su cuenta).
    prisma.trend.count({ where: { clientId, createdAt: { gte: weekAgo }, metadata: { path: ["reelCraft", "band"], equals: "signal" } } }),
    prisma.contentIdea.count({ where: { clientId, status: "REVIEW" } }),
    prisma.contentIdea.count({ where: { clientId, status: "APPROVED" } }),
    prisma.videoScript.count({ where: { clientId, status: "NEW" } }),
    prisma.contentIdea.count({ where: { clientId, status: { in: ["READY_TO_RECORD", "RECORDED"] } } }),
  ]);
  return { inspiracion: references, plan: toReview, guiones: toWrite + scriptsToReview, publicar: toPublish, resultados: 0 };
}
