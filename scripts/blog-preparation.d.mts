import type { PrismaClient } from "@prisma/client";
export type Preparation = { phase: string; attemptId: string; startedAt: string; phaseUpdatedAt: string; deadlineAt: string; finishedAt?: string };
export function preparationPhase(value: unknown): "GENERATING" | "REVIEWING" | "WAITING";
export function newPreparation(now?: Date, timeoutMs?: number): Preparation;
export function setPreparationPhase(db: PrismaClient, id: string, clientId: string, metadata: Preparation, phase: string, now?: Date): Promise<{ count: number } | undefined>;
export function failPreparation(db: PrismaClient, id: string, clientId: string, metadata: Preparation, error: unknown, now?: Date): Promise<{ count: number }>;
export function recoverPreparations(db: PrismaClient, clientId: string, now?: Date): Promise<void>;
