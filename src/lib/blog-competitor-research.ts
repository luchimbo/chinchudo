import { fetchChatCompletion, resolveOpenRouterConfig } from "./llm-provider";
import { COMPETITOR_MAX, MAX_PRIORITY_COMPETITORS } from "./blog-day-plan";

export type OwnProduct = { name: string; brand: string; category: string; description: string };
export type ResearchedCompetitor = { name: string; sourceUrl: string };

/** Cuántos rivales pide cada búsqueda y cuántos productos propios se muestran a la IA. */
export const RESEARCH_TARGET = 12;
const RESEARCH_SAMPLE = 40;

/** Fabricantes cuyo dominio oficial no contiene el nombre de la marca. */
const domainAliases: Record<string, string[]> = {
  universalaudio: ["uaudio.com"],
};

const compact = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]/g, "");

/** La ficha tiene que estar en un dominio del propio fabricante (no tiendas ni reseñas). */
function isOfficialUrl(sourceUrl: string, brand: string): boolean {
  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLocaleLowerCase();
    const key = compact(brand), first = compact(brand.split(/\s+/)[0] || "");
    if (domainAliases[key]?.some(domain => host === domain || host.endsWith(`.${domain}`))) return true;
    const hostKey = compact(host.split(".").slice(0, -1).join(""));
    return [key, first].some(token => token.length >= 3 && hostKey.includes(token));
  } catch { return false; }
}

export function verifiedCompetitorSuggestions(raw: unknown, ownBrands: string[]): ResearchedCompetitor[] {
  const values = raw && typeof raw === "object" && "competitors" in raw ? (raw as { competitors: unknown }).competitors : null;
  if (!Array.isArray(values)) return [];
  const own = ownBrands.map(compact).filter(brand => brand.length >= 3);
  const seen = new Set<string>();
  return values.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    let name = typeof value.name === "string" ? value.name.replace(/\s+/g, " ").trim() : "";
    const brand = (typeof value.brand === "string" && value.brand.trim() ? value.brand : name.split(" ")[0] || "").replace(/\s+/g, " ").trim();
    if (brand && name && !name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase())) name = `${brand} ${name}`;
    const sourceUrl = typeof value.sourceUrl === "string" ? value.sourceUrl.trim() : "";
    const key = name.toLocaleLowerCase();
    if (!name || !brand || name.length > COMPETITOR_MAX || seen.has(key)) return [];
    if (own.some(ownBrand => compact(name).includes(ownBrand) || compact(brand) === ownBrand)) return [];
    if (!isOfficialUrl(sourceUrl, brand)) return [];
    seen.add(key);
    return [{ name, sourceUrl }];
  }).slice(0, MAX_PRIORITY_COMPETITORS);
}

/** Marca de un rival ya verificado: la parte del nombre que coincide con el dominio de su ficha. */
function brandOf(item: ResearchedCompetitor) {
  const words = item.name.split(" ");
  for (let size = Math.min(3, words.length - 1); size >= 1; size -= 1) {
    const brand = words.slice(0, size).join(" ");
    if (isOfficialUrl(item.sourceUrl, brand)) return brand;
  }
  return words[0] || "";
}

export async function reachableCompetitorSuggestions(
  suggestions: ResearchedCompetitor[],
  request: typeof fetch = fetch,
): Promise<ResearchedCompetitor[]> {
  const checks = await Promise.all(suggestions.map(async item => {
    const brand = brandOf(item);
    const probe = (method: "HEAD" | "GET") => request(item.sourceUrl, { method, redirect: "follow", signal: AbortSignal.timeout(8_000) });
    try {
      let response = await probe("HEAD");
      // Algunos fabricantes rechazan HEAD; se confirma con GET antes de descartar la ficha.
      if (!response.ok) response = await probe("GET");
      return response.ok && isOfficialUrl(response.url || item.sourceUrl, brand) ? item : null;
    } catch { return null; }
  }));
  return checks.filter((item): item is ResearchedCompetitor => item !== null);
}

/** Muestra variada del catálogo: alterna categorías para que la IA vea todo el surtido. */
export function sampleCatalog(products: OwnProduct[], size = RESEARCH_SAMPLE): OwnProduct[] {
  const groups = new Map<string, OwnProduct[]>();
  for (const product of products) groups.set(product.category, [...(groups.get(product.category) || []), product]);
  const queues = [...groups.values()];
  const sample: OwnProduct[] = [];
  for (let round = 0; sample.length < size && queues.some(queue => queue.length > round); round += 1) {
    for (const queue of queues) if (queue[round] && sample.length < size) sample.push(queue[round]);
  }
  return sample;
}

export async function researchBlogCompetitors(
  client: { name: string; openrouterApiKey: string | null; openrouterModel: string | null },
  products: OwnProduct[],
  ownBrands: string[],
) {
  const config = resolveOpenRouterConfig(client);
  if (!config.apiKey) throw new Error("Configurá OpenRouter para investigar los rivales.");
  const prompt = {
    store: client.name,
    ownBrands,
    ownProducts: sampleCatalog(products).map(item => ({ ...item, description: item.description.slice(0, 250) })),
    task: `Buscá en la web modelos actuales de OTRAS marcas que un comprador compararía con estos productos propios antes de decidir: mismo tipo de producto, uso y segmento de precio. Devolvé hasta ${RESEARCH_TARGET} modelos reales y vigentes, repartidos entre las distintas categorías del catálogo, con la URL de la ficha oficial en el sitio del fabricante. No incluyas ninguna de las marcas de ownBrands, no uses tiendas ni reseñas como fuente, no inventes modelos ni cifras. Elegí modelos concretos, no marcas genéricas.`,
    format: { competitors: [{ brand: "Marca", name: "Marca Modelo", sourceUrl: "https://fabricante.com/ficha-oficial" }] },
  };
  const { response } = await fetchChatCompletion(config, {
    model: config.model,
    messages: [
      { role: "system", content: "Investigás productos rivales con búsqueda web para comparativas de un blog. Respondé únicamente un objeto JSON válido con competitors." },
      { role: "user", content: JSON.stringify(prompt) },
    ],
    tools: [{ type: "openrouter:web_search" }],
    temperature: 0.1,
    // Los modelos con razonamiento consumen parte del límite antes de escribir la lista.
    reasoning: { effort: "low" },
    max_tokens: 8000,
  }, "Investigación competitiva del blog", client, { signal: AbortSignal.timeout(90_000) }, { allowFallback: false });
  if (!response.ok) throw new Error(`La búsqueda de rivales falló (HTTP ${response.status}).`);
  const result = await response.json();
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error(result?.choices?.[0]?.finish_reason === "length" ? "La IA se quedó sin espacio antes de responder. Probá de nuevo." : "La IA no devolvió una lista de rivales.");
  const start = content.indexOf("{"), end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("La IA no devolvió una lista válida.");
  let parsed: unknown;
  try { parsed = JSON.parse(content.slice(start, end + 1)); } catch { throw new Error("La IA devolvió una lista inválida."); }
  const competitors = await reachableCompetitorSuggestions(verifiedCompetitorSuggestions(parsed, ownBrands));
  if (!competitors.length) throw new Error("No se encontraron modelos con fichas oficiales verificables.");
  return { competitors, model: config.model };
}
