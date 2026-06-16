import type { PrismaClient } from "@prisma/client";

// Devuelve el systemPrompt del PromptVersion activo para un nombre dado, o null si no hay.
export async function loadActivePrompt(
  prisma: PrismaClient,
  name = "response-generator",
): Promise<string | null> {
  const active = await prisma.promptVersion.findFirst({
    where: { name, active: true },
    orderBy: { updatedAt: "desc" },
  });
  const sp = active?.systemPrompt?.trim();
  return sp && sp.length > 0 ? sp : null;
}
