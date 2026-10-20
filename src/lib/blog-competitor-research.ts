import { fetchChatCompletion, resolveOpenRouterConfig } from "./llm-provider";
import { COMPETITOR_MAX, MAX_PRIORITY_COMPETITORS } from "./blog-day-plan";

type OwnProduct = { name: string; model: string; description: string };
export type ResearchedCompetitor = { name: string; sourceUrl: string };

const officialDomains: Record<string, string[]> = {
  yamaha: ["yamaha.com"], roland: ["roland.com"], casio: ["casio.com"], kawai: ["kawai-global.com", "kawaius.com"],
};

function isOfficialUrl(sourceUrl: string, brand: string): boolean {
  try {
    const url = new URL(sourceUrl);
    return url.protocol === "https:" && Boolean(officialDomains[brand]?.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)));
  } catch { return false; }
}

export function verifiedCompetitorSuggestions(raw: unknown, ownBrands: string[]): ResearchedCompetitor[] {
  const values = raw && typeof raw === "object" && "competitors" in raw ? (raw as { competitors: unknown }).competitors : null;
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name.replace(/\s+/g, " ").trim() : "";
    const sourceUrl = typeof value.sourceUrl === "string" ? value.sourceUrl.trim() : "";
    const brand = name.split(" ")[0]?.toLocaleLowerCase();
    if (!name || name.length > COMPETITOR_MAX || seen.has(name.toLocaleLowerCase()) || ownBrands.some(own => own && name.toLocaleLowerCase().includes(own.toLocaleLowerCase()))) return [];
    if (!isOfficialUrl(sourceUrl, brand)) return [];
    seen.add(name.toLocaleLowerCase());
    return [{ name, sourceUrl }];
  }).slice(0, MAX_PRIORITY_COMPETITORS);
}

export async function reachableCompetitorSuggestions(
  suggestions: ResearchedCompetitor[],
  request: typeof fetch = fetch,
): Promise<ResearchedCompetitor[]> {
  const checks = await Promise.all(suggestions.map(async item => {
    const brand = item.name.split(" ")[0].toLocaleLowerCase();
    try {
      const response = await request(item.sourceUrl, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8_000) });
      return response.ok && isOfficialUrl(response.url, brand) ? item : null;
    } catch { return null; }
  }));
  return checks.filter((item): item is ResearchedCompetitor => item !== null);
}

export async function researchBlogCompetitors(client: { name: string; openrouterApiKey: string | null; openrouterModel: string | null }, products: OwnProduct[]) {
  const config = resolveOpenRouterConfig(client);
  if (!config.apiKey) throw new Error("Configurá OpenRouter para investigar los rivales.");
  const prompt = {
    ownBrand: client.name,
    ownProducts: products.slice(0, 30),
    task: "Buscá en la web modelos actuales de Yamaha, Roland, Casio o Kawai comparables por tipo de instrumento y uso con estos productos propios. Devolvé hasta ocho modelos reales, variados, con URL de la ficha oficial del fabricante para cada uno. No inventes modelos ni cifras, no incluyas productos de la marca propia. Elegí modelos concretos, no marcas genéricas.",
    format: { competitors: [{ name: "Marca Modelo", sourceUrl: "https://fabricante.com/ficha-oficial" }] },
  };
  const { response } = await fetchChatCompletion(config, {
    model: config.model,
    messages: [
      { role: "system", content: "Investigás rivales de pianos digitales con búsqueda web. Respondé únicamente un objeto JSON válido con competitors." },
      { role: "user", content: JSON.stringify(prompt) },
    ],
    tools: [{ type: "openrouter:web_search" }],
    temperature: 0.1,
    max_tokens: 1800,
  }, "Investigación competitiva del blog", client, { signal: AbortSignal.timeout(60_000) }, { allowFallback: false });
  if (!response.ok) throw new Error(`La búsqueda de rivales falló (HTTP ${response.status}).`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("La IA no devolvió una lista de rivales.");
  const start = content.indexOf("{"), end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("La IA no devolvió una lista válida.");
  let parsed: unknown;
  try { parsed = JSON.parse(content.slice(start, end + 1)); } catch { throw new Error("La IA devolvió una lista inválida."); }
  const competitors = await reachableCompetitorSuggestions(verifiedCompetitorSuggestions(parsed, [client.name]));
  if (!competitors.length) throw new Error("No se encontraron modelos con fichas oficiales verificables.");
  return { competitors, model: config.model };
}
