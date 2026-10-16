import type { PrismaClient } from "@prisma/client";
export function recoverMissedBlogArticles(prisma: PrismaClient, clientId: string, options: { today: string; dryRun?: boolean; inspect?: (content: any, id: string) => Promise<any> }): Promise<Array<{ id: string; from: string; to?: string; status: string; error?: string }>>;
