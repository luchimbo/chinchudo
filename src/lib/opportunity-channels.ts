import type { Prisma } from "@prisma/client";

/** The only channel exposed to the operational opportunity workflow. */
export const YOUTUBE_OPPORTUNITY_CHANNEL_NAME = "YouTube";

export const OPPORTUNITY_CHANNEL_NAMES = [YOUTUBE_OPPORTUNITY_CHANNEL_NAME] as const;

export function isOperationalOpportunityChannel(name: string | null | undefined) {
  return name?.trim().toLowerCase() === "youtube";
}

/**
 * Reusable relation filter for every operator-facing opportunity query.
 * Legacy channels remain stored, but are never part of the operational view.
 */
export function operationalOpportunityWhere(): Prisma.OpportunityWhereInput {
  return { channel: { name: YOUTUBE_OPPORTUNITY_CHANNEL_NAME } };
}

export function assertOperationalOpportunityChannel(name: string | null | undefined) {
  if (!isOperationalOpportunityChannel(name)) {
    throw new Error("Solo se pueden operar oportunidades de YouTube.");
  }
}
