import type { PrismaClient } from "@prisma/client";

/**
 * Cuenta de la conexión OAuth de YouTube con la que publica un cliente (la más
 * reciente). `requested` sólo elige entre conexiones existentes: los perfiles de
 * navegador de accounts.json (p. ej. "cazador-ofertas") no son cuentas de YouTube.
 * Devuelve null si el cliente no conectó ningún canal.
 */
export async function resolveYouTubeAccount(
  prisma: Pick<PrismaClient, "youTubeConnection">,
  clientId: string,
  requested?: string | null,
): Promise<string | null> {
  const connections = await prisma.youTubeConnection.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    select: { account: true },
  });
  return connections.find((connection) => connection.account === requested)?.account ?? connections[0]?.account ?? null;
}
