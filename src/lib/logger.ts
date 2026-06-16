import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type LogLevel = "info" | "warn" | "error";

async function writeLog(level: LogLevel, event: string, message: string, meta?: unknown) {
  // meta es Json nativo; Prisma no acepta null — usar {} como fallback
  const metaValue: Prisma.InputJsonValue = (meta !== undefined && meta !== null)
    ? (meta as Prisma.InputJsonValue)
    : {};
  try {
    await prisma.systemLog.create({ data: { level, event, message, meta: metaValue } });
  } catch {
    // Si falla la DB, al menos queda en consola
    console[level](`[${event}] ${message}`, meta ?? "");
  }
}

export const logger = {
  info:  (event: string, message: string, meta?: unknown) => writeLog("info",  event, message, meta),
  warn:  (event: string, message: string, meta?: unknown) => writeLog("warn",  event, message, meta),
  error: (event: string, message: string, meta?: unknown) => writeLog("error", event, message, meta),
};
