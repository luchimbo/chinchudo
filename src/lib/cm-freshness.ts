import { createHash } from "node:crypto";
import { deriveCopilotApproach } from "./cm-editorial";
import type { OpportunityIntent } from "@prisma/client";

/** Stored in Response.evidence in Postgres; previous responses remain audit records. */
export type CMGeneration = {
  kind: "cm_generation";
  version: string;
  input: string;
  generatedAt: string;
  source: "ai" | "local";
};

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]),
  );
  return value;
}

export function cmHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function cmObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export type CMInput = {
  sourceText: string;
  sourceTitle: string;
  channelId: string;
  detectedIntent: string;
  detectedProductId: string | null;
  detectedBrandId?: string | null;
  contextAssessment: unknown;
};

export function cmInputHash(opportunity: CMInput): string {
  const context = cmObject(opportunity.contextAssessment);
  const copilot = cmObject(context.copilot);
  const approach = deriveCopilotApproach({ sourceText: opportunity.sourceText, detectedIntent: opportunity.detectedIntent as OpportunityIntent });
  return cmHash({
    sourceText: opportunity.sourceText, sourceTitle: opportunity.sourceTitle,
    channelId: opportunity.channelId, intent: opportunity.detectedIntent,
    productId: opportunity.detectedProductId,
    brandId: opportunity.detectedBrandId,
    // generatedAt, pulse.selectedAt and operational notes must not invalidate a draft.
    copilot: { goal: copilot.goal ?? approach.goal, style: copilot.style ?? approach.style, productChoice: copilot.productChoice },
  });
}

export function cmGeneration(evidence: unknown): CMGeneration | null {
  if (!Array.isArray(evidence)) return null;
  for (const value of evidence) {
    const item = cmObject(value);
    if (item.kind === "cm_generation" && typeof item.version === "string" && typeof item.input === "string"
      && typeof item.generatedAt === "string" && (item.source === "ai" || item.source === "local")) {
      return item as CMGeneration;
    }
  }
  return null;
}

export function cmIsFresh(evidence: unknown, version: string, opportunity: CMInput): boolean {
  const stamp = cmGeneration(evidence);
  return stamp?.version === version && stamp.input === cmInputHash(opportunity);
}

export function cmStamp(version: string, opportunity: CMInput, source: CMGeneration["source"]): CMGeneration {
  return { kind: "cm_generation", version, input: cmInputHash(opportunity), source, generatedAt: new Date().toISOString() };
}

export type CMResponseState = {
  id: string;
  evidence: unknown;
  editedText: string;
  approvedBy: string;
  acceptedAsCorrectAt: Date | null;
  isPrimary: boolean;
  chatHistory: unknown;
  publishingLog?: unknown;
};

export function cmHasHumanWork(response: CMResponseState): boolean {
  return Boolean(response.editedText || response.approvedBy || response.acceptedAsCorrectAt
    || (Array.isArray(response.chatHistory) && response.chatHistory.length) || response.publishingLog);
}

export type CMCoverageStatus = "missing" | "stale" | "fresh" | "review" | "error";
export function cmCoverageStatus(responses: CMResponseState[], version: string, opportunity: CMInput, failed = false): CMCoverageStatus {
  const fresh = responses.find((response) => cmIsFresh(response.evidence, version, opportunity));
  if (failed && !fresh) return "error";
  if (!responses.length) return "missing";
  if (!fresh) return "stale";
  const selected = responses.find((response) => response.isPrimary) ?? responses[0];
  return selected.id !== fresh.id && cmHasHumanWork(selected) ? "review" : "fresh";
}

/** Urgency first, then interleave missing/stale; reserve an oldest slot to avoid starvation. */
export function cmSelectBatch<T extends { id: string; priority: string; createdAt: Date; status: CMCoverageStatus }>(rows: T[], limit: number): T[] {
  const eligible = rows.filter((row) => ["missing", "stale", "error"].includes(row.status));
  const rank: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const order = (a: T, b: T) => (rank[a.priority] ?? 3) - (rank[b.priority] ?? 3) || b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  const missing = eligible.filter((row) => row.status === "missing").sort(order);
  const stale = eligible.filter((row) => row.status !== "missing").sort(order);
  const selected: T[] = [];
  while (selected.length < limit && (missing.length || stale.length)) {
    const left = missing[0]; const right = stale[0];
    const chooseMissing = !right || (left && ((rank[left.priority] ?? 3) < (rank[right.priority] ?? 3)
      || ((rank[left.priority] ?? 3) === (rank[right.priority] ?? 3) && selected.length % 2 === 0)));
    selected.push((chooseMissing ? missing : stale).shift()!);
  }
  if (limit > 1 && eligible.length > limit) {
    const oldest = [...eligible].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))[0];
    if (!selected.some((row) => row.id === oldest.id)) selected[selected.length - 1] = oldest;
  }
  return selected;
}
