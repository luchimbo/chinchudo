export type CoverageRow = { id: string; status: string; error: string; revision?: string; primaryResponseId?: string; latestResponseId?: string };
type Card = { coverageRevision?: string; responses: { id: string; isPrimary: boolean }[] };

/** A counter/freshness update is not a reason to reload every conversation. */
export function coverageNeedsDetail(card: Card, row: CoverageRow): boolean {
  if (card.coverageRevision && row.revision && card.coverageRevision !== row.revision) return true;
  const primary = card.responses.find(response => response.isPrimary) ?? card.responses[0];
  if (row.primaryResponseId !== undefined && row.primaryResponseId !== (primary?.id || "")) return true;
  return row.status === "review" && !!row.latestResponseId && !card.responses.some(response => response.id === row.latestResponseId);
}
