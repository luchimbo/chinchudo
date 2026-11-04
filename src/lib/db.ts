import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

// Next can load this module in separate route bundles in the same process.
// Share the pool there as well; authorization remains request scoped in auth.ts.
globalForPrisma.prisma = prisma;

