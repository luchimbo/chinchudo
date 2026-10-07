import type { ArticleCatalog } from "./article-markers";
import type { EditorialSource } from "./blog-quality.mjs";
export function completeArticle(input: { content: Record<string, any>; catalog: ArticleCatalog; sources?: EditorialSource[] }): { content: Record<string, any>; changes: string[]; relatedAvailable: boolean };
