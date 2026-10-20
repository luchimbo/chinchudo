import type { EditorialIntent } from "./blog-quality.mjs";
export function explicitIntent(preparation: unknown): EditorialIntent | null;
export function intentForSlot(slot: { scheduledDate: Date | string; preparation?: unknown }): EditorialIntent;
export function carryIntent<T>(previous: unknown, next: T): T | (T & { editorialIntent: EditorialIntent });
