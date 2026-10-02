import type { PrismaClient } from "@prisma/client";
import type { EditorialSource, EditorialQuality } from "./blog-quality.mjs";
export function loadBlogEvidence(prisma: PrismaClient, clientId: string): Promise<{ sources: EditorialSource[]; products: Record<string, { nombre: string; url: string; uso: string; updatedAt: string }>; categories: Record<string, { nombre: string }>; stored: EditorialSource[] }>;
export function editableArticleContent(content: Record<string, any>): Record<string, any>;
export function inspectBlogArticle(prisma: PrismaClient, clientId: string, content: Record<string, any>, excludeId?: string): Promise<EditorialQuality>;
