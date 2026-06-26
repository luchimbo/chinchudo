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

let cachedClients: any = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10000; // 10 segundos para scripts y respuestas rápidas

export async function detectCrossClientTerms(
  prisma: PrismaClient,
  clientId: string,
  text: string,
): Promise<string[]> {
  const norm = normalizeForMatch(text);
  const now = Date.now();

  if (!cachedClients || now - lastCacheTime > CACHE_TTL_MS) {
    cachedClients = await prisma.client.findMany({
      where: { active: true },
      include: { brands: true },
    });
    lastCacheTime = now;
  }

  const otherClients = cachedClients.filter((c: any) => c.id !== clientId);

  const hits: string[] = [];
  for (const client of otherClients) {
    const keywords = [
      client.name,
      client.slug,
      ...parseClientList(client.domainKeywords),
      ...client.brands.map((brand: any) => brand.name),
    ];
    const matched = keywords
      .filter((kw) => kw.length >= 4)
      .filter((kw) => {
        const normalizedKw = normalizeForMatch(kw);
        const escaped = normalizedKw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        return regex.test(norm);
      });
    if (matched.length > 0) hits.push(`${client.slug}:${Array.from(new Set(matched)).join(",")}`);
  }
  return hits;
}
