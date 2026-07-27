import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { platformAdminPrisma?: PrismaClient };
export const prisma = globalForPrisma.platformAdminPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.platformAdminPrisma = prisma;
