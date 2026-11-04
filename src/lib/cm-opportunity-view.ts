import type { Prisma } from "@prisma/client";
import { cmIsFresh } from "./cm-freshness";
export const cmViewInclude = { channel: { select: { name: true } }, detectedBrand: { select: { name: true } }, detectedProduct: { select: { name: true } },
  responses: { include: { persona: { select: { name: true } } }, orderBy: [{ isPrimary: "desc" as const }, { createdAt: "desc" as const }, { id: "desc" as const }] } };
type FullRow = Prisma.OpportunityGetPayload<{ include: typeof cmViewInclude }>;
type ViewResponse = Pick<FullRow["responses"][number], "id" | "editedText" | "draftText" | "variantType" | "isPrimary" | "persona" | "acceptedAsCorrectAt" | "evidence"> & { chatHistory?: Prisma.JsonValue };
type Row = Omit<FullRow, "responses"> & { responses: ViewResponse[] };
export const cmSummaryResponses = { orderBy: cmViewInclude.responses.orderBy, take: 1,
  select: { id: true, editedText: true, draftText: true, variantType: true, isPrimary: true, persona: { select: { name: true } }, acceptedAsCorrectAt: true, evidence: true } };

export function cmOpportunityView(row: Row, version = "", status = "pending", error = "", includeHistory = false) {
  return { id: row.id, text: row.sourceText, title: row.sourceTitle, notes: row.notes, author: row.sourceAuthor, sourceUrl: row.sourceUrl,
    channel: row.channel.name, brand: row.detectedBrand?.name ?? "Marca por definir", product: row.detectedProduct?.name ?? "", productId: row.detectedProductId ?? "",
    createdAt: row.createdAt.toISOString(), status: row.status, freshness: status, refreshError: error,
    responses: row.responses.map(response => ({ id: response.id, text: response.editedText || response.draftText, variantType: response.variantType, isPrimary: response.isPrimary,
      persona: response.persona.name, acceptedAsCorrect: Boolean(response.acceptedAsCorrectAt), fresh: !!version && cmIsFresh(response.evidence, version, row),
      chatHistory: includeHistory && Array.isArray(response.chatHistory) ? response.chatHistory as unknown as { sender: "user" | "assistant"; text: string; suggestion?: { text: string; original: string } }[] : [] })),
  };
}
