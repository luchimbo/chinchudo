import { prisma } from "./db";

// Sliding window rate limiter respaldado en Postgres. La versión anterior
// era un Map en memoria por proceso: en Vercel serverless cada instancia
// tiene su propia ventana, así que el límite efectivo era N × instancias.
// Con una tabla compartida el límite es real sin importar cuántas
// instancias sirvan requests.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  const hits = await prisma.rateLimitHit.findMany({
    where: { key, hitAt: { gt: windowStart } },
    orderBy: { hitAt: "asc" },
    select: { hitAt: true },
  });

  if (hits.length >= maxRequests) {
    const oldest = hits[0].hitAt.getTime();
    return { allowed: false, remaining: 0, resetInMs: windowMs - (now.getTime() - oldest) };
  }

  await prisma.rateLimitHit.create({ data: { key, hitAt: now } });

  // Housekeeping barato y sin setInterval (que en serverless no tiene sentido:
  // el proceso no vive lo suficiente para que dispare, y en local mantenía
  // vivo el event loop innecesariamente): con baja probabilidad, de paso,
  // se borran hits viejos de esta misma clave.
  if (Math.random() < 0.05) {
    await prisma.rateLimitHit
      .deleteMany({ where: { key, hitAt: { lt: new Date(now.getTime() - Math.max(windowMs, 60 * 60 * 1000)) } } })
      .catch(() => undefined);
  }

  return { allowed: true, remaining: maxRequests - hits.length - 1, resetInMs: 0 };
}
