import { getFormula, median, outlierMultiple } from "@/lib/reel-craft";

// ig-audit: cómo le fue a cada pieza contra la mediana de las piezas propias.

export type PieceMetrics = { views: number | null; reach: number | null; likes: number | null; comments: number | null; saves: number | null; shares: number | null; source: string; capturedAt: Date };
export type ResultPiece = { id: string; hook: string; pieceType: string; formulaId: number | null; metrics: PieceMetrics | null };

export const MIN_PIECES_FOR_LEARNING = 8;

export type ResultRow = ResultPiece & { multiple: number | null };
export type ResultGroup = { key: string; label: string; pieces: number; medianMultiple: number };
export type ResultsSummary = { rows: ResultRow[]; ownMedian: number | null; measured: number; enoughData: boolean; byFormula: ResultGroup[]; byType: ResultGroup[] };

const TYPE_LABEL: Record<string, string> = { REEL: "Reel", CAROUSEL: "Carrusel", STORY: "Historia" };

function groupBy(rows: ResultRow[], keyOf: (row: ResultRow) => string | null, labelOf: (key: string) => string): ResultGroup[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key || row.multiple == null) continue;
    groups.set(key, [...(groups.get(key) ?? []), row.multiple]);
  }
  return Array.from(groups.entries())
    .map(([key, values]) => ({ key, label: labelOf(key), pieces: values.length, medianMultiple: Math.round((median(values) ?? 0) * 10) / 10 }))
    .sort((a, b) => b.medianMultiple - a.medianMultiple || b.pieces - a.pieces);
}

export function summarizeResults(pieces: ResultPiece[]): ResultsSummary {
  const views = pieces.map((piece) => piece.metrics?.views ?? 0).filter((value) => value > 0);
  const ownMedian = views.length >= 3 ? median(views) : null;
  const rows = pieces.map((piece) => ({ ...piece, multiple: outlierMultiple(piece.metrics?.views ?? null, ownMedian) }));
  const enoughData = views.length >= MIN_PIECES_FOR_LEARNING;
  return {
    rows,
    ownMedian,
    measured: views.length,
    enoughData,
    byFormula: enoughData ? groupBy(rows, (row) => (row.formulaId ? String(row.formulaId) : null), (key) => getFormula(Number(key))?.name ?? key) : [],
    byType: enoughData ? groupBy(rows, (row) => row.pieceType, (key) => TYPE_LABEL[key] ?? key) : [],
  };
}

/** Fórmulas que mejor le funcionan al cliente (para ordenar las candidatas). */
export function ownBestFormulas(summary: ResultsSummary): number[] {
  return summary.byFormula.filter((group) => group.medianMultiple >= 1 && group.pieces >= 2).map((group) => Number(group.key));
}

export function multipleOwnPhrase(multiple: number | null): string | null {
  if (multiple == null) return null;
  if (multiple >= 1.5) return `${multiple.toLocaleString("es-AR", { maximumFractionDigits: 1 })} veces tu promedio`;
  if (multiple >= 0.8) return "como tu promedio";
  return "por debajo de tu promedio";
}

/** Lee las piezas publicadas con su última métrica y devuelve las fórmulas que mejor le funcionan al cliente. */
export async function loadOwnBestFormulas(clientId: string): Promise<number[]> {
  const { prisma } = await import("@/lib/db");
  const published = await prisma.contentIdea.findMany({
    where: { clientId, status: "PUBLISHED" },
    select: { id: true, hook: true, pieceType: true, formulaId: true, metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
    take: 120,
  });
  return ownBestFormulas(summarizeResults(published.map((piece) => ({ id: piece.id, hook: piece.hook, pieceType: piece.pieceType, formulaId: piece.formulaId, metrics: piece.metrics[0] ?? null }))));
}
