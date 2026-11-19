import type { PrismaClient } from "@prisma/client";

const OPEN_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED"] as const;

function youtubeThread(url: string): { videoId: string; commentRoot: string } | null {
  try {
    const parsed = new URL(url);
    const videoId = parsed.searchParams.get("v") || (parsed.hostname.endsWith("youtu.be") ? parsed.pathname.slice(1) : "");
    if (!videoId) return null;
    // Las respuestas tienen id `padre.respuesta`; el hilo es el comentario padre.
    const commentRoot = (parsed.searchParams.get("lc") || "").split(".")[0];
    return { videoId, commentRoot };
  } catch {
    return null;
  }
}

/**
 * Después de responder un comentario de YouTube, descarta las oportunidades
 * abiertas que quedaron contestadas con esa misma respuesta: el mismo hilo de
 * comentarios o la misma persona en el mismo video. Las preguntas de otras
 * personas en ese video siguen abiertas.
 */
export async function closeSiblingOpportunities(
  prisma: PrismaClient,
  opportunityId: string,
  channelId: string,
  sourceUrl: string,
  sourceAuthor: string,
): Promise<number> {
  const thread = youtubeThread(sourceUrl);
  if (!thread) return 0;
  const author = sourceAuthor.trim().toLowerCase();
  const candidates = await prisma.opportunity.findMany({
    where: {
      id: { not: opportunityId },
      channelId,
      status: { in: [...OPEN_STATUSES] },
      sourceUrl: { contains: thread.videoId },
    },
    select: { id: true, sourceUrl: true, sourceAuthor: true },
  });
  const siblings = candidates.filter((candidate) => {
    const other = youtubeThread(candidate.sourceUrl);
    if (!other || other.videoId !== thread.videoId) return false;
    const sameThread = Boolean(thread.commentRoot) && other.commentRoot === thread.commentRoot;
    const sameAuthor = Boolean(author) && candidate.sourceAuthor.trim().toLowerCase() === author;
    return sameThread || sameAuthor;
  });
  if (!siblings.length) return 0;
  const result = await prisma.opportunity.updateMany({
    where: { id: { in: siblings.map((sibling) => sibling.id) }, status: { in: [...OPEN_STATUSES] } },
    data: { status: "DISCARDED", notes: "Auto-descartada: ya se respondió este hilo o a esta persona en el mismo video." },
  });
  return result.count;
}
