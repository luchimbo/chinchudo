export type BlogLease = { clientId: string; signal: AbortSignal; assert(): void };
export function withBlogLease<T>(prisma: any, clientId: string, callback: (lease: BlogLease) => Promise<T>): Promise<T | null>;
