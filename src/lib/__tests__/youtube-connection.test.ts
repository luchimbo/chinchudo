import { describe, expect, it, vi } from "vitest";
import { resolveYouTubeAccount } from "../youtube-connection";

function prismaWith(accounts: string[]) {
  const findMany = vi.fn(async () => accounts.map((account) => ({ account })));
  return { prisma: { youTubeConnection: { findMany } } as never, findMany };
}

describe("resolveYouTubeAccount", () => {
  it("respeta la conexión pedida cuando existe para el cliente", async () => {
    const { prisma } = prismaWith(["youtube-principal", "youtube-secundaria"]);
    expect(await resolveYouTubeAccount(prisma, "client-1", "youtube-secundaria")).toBe("youtube-secundaria");
  });

  it("usa la conexión más reciente cuando llega un perfil de navegador de accounts.json", async () => {
    const { prisma, findMany } = prismaWith(["youtube-principal"]);
    expect(await resolveYouTubeAccount(prisma, "client-1", "cazador-ofertas")).toBe("youtube-principal");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-1" }, orderBy: { updatedAt: "desc" } }));
  });

  it("devuelve null si el cliente no conectó ningún canal", async () => {
    const { prisma } = prismaWith([]);
    expect(await resolveYouTubeAccount(prisma, "client-1", "youtube-principal")).toBeNull();
  });
});
