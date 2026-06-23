import type { Brand, Client, Persona, PrismaClient } from "@prisma/client";
import { normalizeForMatch, parseClientList } from "./client-context";

export type GuardrailResult = {
  ok: boolean;
  riskNotes: string[];
};

export function validateClientScopedActors(args: {
  client: Client;
  brand: Brand;
  persona: Persona;
}): GuardrailResult {
  const riskNotes: string[] = [];
  if (args.brand.clientId && args.brand.clientId !== args.client.id) {
    riskNotes.push(`Marca fuera de cliente: ${args.brand.name}`);
  }
  if (args.persona.clientId && args.persona.clientId !== args.client.id) {
    riskNotes.push(`Persona fuera de cliente: ${args.persona.name}`);
  }
  return { ok: riskNotes.length === 0, riskNotes };
}

export async function detectCrossClientTerms(
  prisma: PrismaClient,
  clientId: string,
  text: string,
): Promise<string[]> {
  const norm = normalizeForMatch(text);
  const otherClients = await prisma.client.findMany({
    where: { active: true, NOT: { id: clientId } },
    include: { brands: true },
  });

  const hits: string[] = [];
  for (const client of otherClients) {
    const keywords = [
      client.name,
      client.slug,
      ...parseClientList(client.domainKeywords),
      ...client.brands.map((brand) => brand.name),
    ];
    const matched = keywords
      .filter((kw) => kw.length >= 4)
      .filter((kw) => norm.includes(normalizeForMatch(kw)));
    if (matched.length > 0) hits.push(`${client.slug}:${Array.from(new Set(matched)).join(",")}`);
  }
  return hits;
}
