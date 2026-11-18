import type { Brand, Client, Persona, Prisma, PrismaClient } from "@prisma/client";
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

type ClientWithBrands = Prisma.ClientGetPayload<{ include: { brands: true } }>;
let cachedClients: ClientWithBrands[] | null = null;
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

  const ownClient = cachedClients.find((client) => client.id === clientId);
  const ownTerms = ownClient ? [ownClient.name, ownClient.slug, ...parseClientList(ownClient.domainKeywords), ...ownClient.brands.map(brand => brand.name)] : [];
  const ownDomain = normalizeForMatch(ownTerms.join(" | "));
  const otherClients = cachedClients.filter((client) => client.id !== clientId);

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
      .filter((kw) => {
        const normalizedKw = normalizeForMatch(kw);
        if (!normalizedKw) return false;
        const escaped = normalizedKw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('\\b' + escaped + '\\b', 'i');
        // A domain keyword is not exclusive to a tenant. "piano" belongs to
        // both Kressmer and PC MIDI ("piano digital"); PC MIDI also sells
        // Kressmer. Keep rejecting terms absent from the current client's domain.
        if (regex.test(ownDomain)) return false;
        return regex.test(norm);
      });
    if (matched.length > 0) hits.push(`${client.slug}:${Array.from(new Set(matched)).join(",")}`);
  }
  return hits;
}
