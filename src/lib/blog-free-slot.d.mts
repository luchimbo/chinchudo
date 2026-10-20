import type { EditorialIntent } from "./blog-quality.mjs";
export function nextFreeEditorialDay(input: { from: string; intent: EditorialIntent; isTaken: (day: string) => boolean; limit?: number }): string;
export type DateHistoryEntry = { at: string; from: string; to: string; reason: "reschedule" | "published_early" | "displaced" };
export function withDateHistory(preparation: unknown, entry: Omit<DateHistoryEntry, "at">, now?: Date): Record<string, unknown>;
