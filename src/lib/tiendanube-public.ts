import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { gunzipSync } from "node:zlib";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import type { LookupAddress } from "node:dns";
import * as cheerio from "cheerio";

export type StoreSnapshot = {
  kind: "product" | "category";
  id: string;
  url: string;
  name: string;
  brand: string;
  description: string;
  sku: string;
  categories: Array<{ name: string; url: string }>;
  price: string;
  currency: string;
  availability: string;
  fetchedAt: string;
  requestedUrls?: string[];
};
export const normalizeCatalogText = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const catalogUrl = (s: string) => {
  try { const u = new URL(s); u.hash = ""; u.search = ""; u.pathname = u.pathname.replace(/\/+$/, "") || "/"; return u.href; } catch { return ""; }
};
const clean = (s: unknown, max = 4000) => cheerio.load(String(s ?? ""), {}, false).text().replace(/\s+/g, " ").trim().slice(0, max);
const objects = (value: unknown): Record<string, any>[] => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(objects) : [value as Record<string, any>, ...Object.values(value).flatMap(objects)];

export function parseStorePage(html: string, fetchedUrl: string, now = new Date()): StoreSnapshot | null {
  const $ = cheerio.load(html);
  const canonical = $("link[rel='canonical']").first().attr("href");
  const url = new URL(canonical || fetchedUrl, fetchedUrl).href;
  const data = $("script[type='application/ld+json']").toArray().flatMap(n => {
    try { return objects(JSON.parse($(n).text())); } catch { return []; }
  });
  const detail = $("[data-store='product-detail'][data-product-id]").first();
  const productId = detail.attr("data-product-id");
  const product = data.find(o => (o["@type"] === "Product" || o["@type"]?.includes?.("Product")) &&
    [o["@id"], o.url, o.mainEntityOfPage?.["@id"], ...(Array.isArray(o.offers) ? o.offers.map((x: any) => x.url) : [o.offers?.url])].some(v => v && catalogUrl(new URL(v, url).href) === catalogUrl(url)));
  if (productId && /^\d+$/.test(productId) && product?.name) {
    let variants: any[] = [];
    try { variants = JSON.parse(detail.attr("data-variants") || "[]").filter((v: any) => String(v.product_id) === productId); } catch { /* Optional. */ }
    const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers || {};
    const crumbs = data.find(o => o["@type"] === "BreadcrumbList")?.itemListElement || [];
    const descriptionNode = $("[data-store='product-description'], .js-product-description, #product-description").first();
    return {
      kind: "product", id: productId, url, name: clean(product.name, 240), brand: clean(product.brand?.name || product.brand || "", 120),
      description: clean(descriptionNode.text() || product.description), sku: clean(product.sku || variants[0]?.sku, 160),
      categories: crumbs.filter((c: any) => c.item && catalogUrl(typeof c.item === "string" ? c.item : c.item["@id"]) !== catalogUrl(url))
        .map((c: any) => ({ name: clean(c.name, 240), url: new URL(typeof c.item === "string" ? c.item : c.item["@id"], url).href }))
        .filter((c: { url: string }) => new URL(c.url).pathname !== "/"),
      price: clean(offer.price ?? "", 80), currency: clean(offer.priceCurrency, 20), availability: clean(offer.availability, 160), fetchedAt: now.toISOString(),
    };
  }
  // Read numeric identity only; never execute storefront JavaScript.
  const category = html.match(/LS\.category\s*=\s*\{\s*id\s*:\s*(\d+)\s*,/);
  if (category && $("h1").first().text().trim()) return {
    kind: "category", id: category[1], url, name: clean($("h1").first().text(), 240), brand: "", description: clean($("meta[name='description']").attr("content")),
    sku: "", categories: [], price: "", currency: "", availability: "", fetchedAt: now.toISOString(),
  };
  return null;
}

export function parseSitemap(xml: string, base: string): { urls: string[]; indexes: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  if (!$("urlset, sitemapindex").length) throw new Error("El sitemap no contiene un índice o listado válido.");
  const resolve = (selector: string) => $(selector).toArray().map(n => new URL($(n).text().trim(), base).href);
  return { urls: resolve("urlset > url > loc"), indexes: resolve("sitemapindex > sitemap > loc") };
}

export function robotsAllows(robots: string, path: string, agent = "PCMidi-CatalogBot"): boolean {
  const groups: Array<{ agents: string[]; rules: Array<{ allow: boolean; value: string }> }> = [];
  let group: typeof groups[number] | undefined;
  for (const line of robots.split(/\r?\n/)) {
    const m = line.replace(/#.*$/, "").match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2];
    if (key === "user-agent") {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else if (group && ["allow", "disallow"].includes(key) && value) group.rules.push({ allow: key === "allow", value });
  }
  const specific = groups.filter(g => g.agents.some(a => a !== "*" && agent.toLowerCase().includes(a)));
  const rules = (specific.length ? specific : groups.filter(g => g.agents.includes("*"))).flatMap(g => g.rules);
  let selected: typeof rules[number] | undefined;
  for (const rule of rules) {
    const pattern = rule.value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$");
    if (new RegExp(`^${pattern}`).test(path) && (!selected || rule.value.length > selected.value.length || rule.value.length === selected.value.length && rule.allow)) selected = rule;
  }
  return selected?.allow ?? true;
}

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0",8], ["10.0.0.0",8], ["127.0.0.0",8], ["169.254.0.0",16], ["172.16.0.0",12], ["192.168.0.0",16], ["100.64.0.0",10], ["224.0.0.0",4], ["240.0.0.0",4]] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::",128], ["::1",128], ["fc00::",7], ["fe80::",10], ["ff00::",8]] as const) blocked.addSubnet(address,prefix,"ipv6");
export function privateStoreAddress(address: string): boolean {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (/^::ffff:/i.test(address) && !mapped) return true;
  return blocked.check(mapped?.[1] || address, mapped || isIP(address) === 4 ? "ipv4" : "ipv6");
}
export class StoreHttpError extends Error { constructor(public status: number, public url: string) { super(`La tienda respondió ${status}: ${url}`); } }

// Pin the validated DNS answer to the socket so a second lookup cannot reach an internal IP.
function pinnedRequest(url: URL, addresses: LookupAddress[], signal: AbortSignal): Promise<Response> {
  return new Promise((resolve,reject) => {
    const pinnedLookup = ((_host: string, options: any, callback: any) => options.all
      ? callback(null,addresses)
      : callback(null,addresses[0].address,addresses[0].family)) as typeof import("node:dns").lookup;
    const request = httpsRequest(url,{lookup:pinnedLookup,signal,headers:{
      "User-Agent":"PCMidi-CatalogBot/1.0 (+https://www.pcmidi.com.ar)",
      Accept:"text/html,application/xml,text/xml,application/gzip",
    }},response => {
      const headers = new Headers();
      for(const [name,value] of Object.entries(response.headers))if(value)headers.set(name,Array.isArray(value)?value.join(", "):value);
      resolve(new Response([204,304].includes(response.statusCode||0)?null:Readable.toWeb(response) as ReadableStream<Uint8Array>,{status:response.statusCode||502,headers}));
    });
    request.on("error",error => {const networkError=new TypeError(error.message);reject(signal.aborted?signal.reason:networkError);});
    request.end();
  });
}

export function createStoreReader(storeUrl: string, options: { fetch?: typeof fetch; lookup?: typeof lookup; intervalMs?: number; sleep?: (ms: number) => Promise<void>; signal?: AbortSignal } = {}) {
  const base = new URL(storeUrl);
  const allowedHosts = new Set([base.hostname, base.hostname.replace(/^www\./, ""), `www.${base.hostname.replace(/^www\./, "")}`]);
  const dns = options.lookup || lookup;
  const resolved = new Map<string,LookupAddress[]>();
  const sleep = options.sleep || ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  let lastRequest = 0, robots = "";
  async function validate(raw: string) {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443" || !allowedHosts.has(url.hostname)) throw new Error("Destino fuera de la tienda autorizada.");
    const addresses = await dns(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(a => privateStoreAddress(a.address))) throw new Error("El destino de la tienda apunta a una dirección interna.");
    resolved.set(url.hostname,addresses);
    return url;
  }
  async function read(raw: string, redirects = 0): Promise<{ url: string; text: string }> {
    const url = await validate(raw);
    if (url.pathname !== "/robots.txt" && !robotsAllows(robots, url.pathname + url.search)) throw new Error(`Robots impide recorrer ${url.pathname}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      options.signal?.throwIfAborted();
      await sleep(Math.max(0, (options.intervalMs ?? 1000) - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      try {
        const signal=options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
        const response = options.fetch
          ? await options.fetch(url.href,{redirect:"manual",signal})
          : await pinnedRequest(url,resolved.get(url.hostname)!,signal);
        if ([301,302,303,307,308].includes(response.status)) {
          if (redirects >= 4 || !response.headers.get("location")) throw new Error("Redirección inválida o excesiva.");
          return read(new URL(response.headers.get("location")!, url).href, redirects + 1);
        }
        if (!response.ok) throw new StoreHttpError(response.status, url.href);
        const limit = /sitemap|\.gz$/.test(url.pathname) ? 16_000_000 : 4_000_000;
        if (Number(response.headers.get("content-length")) > limit) throw new Error("Respuesta demasiado grande.");
        const chunks: Uint8Array[] = []; let size = 0;
        if (response.body) for await (const chunk of response.body as any as AsyncIterable<Uint8Array>) {
          size += chunk.byteLength; if (size > limit) { await response.body.cancel().catch(() => {}); throw new Error("Respuesta demasiado grande."); } chunks.push(chunk);
        }
        let bytes = Buffer.concat(chunks);
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes, { maxOutputLength: limit });
        return { url: url.href, text: bytes.toString("utf8") };
      } catch (error) {
        const transient = error instanceof StoreHttpError ? error.status === 429 || error.status >= 500 : error instanceof Error && ["TimeoutError", "TypeError"].includes(error.name);
        if (!transient || attempt === 2) throw error;
        await sleep(2000 * (attempt + 1));
      }
    }
    throw new Error("No se pudo leer la tienda.");
  }
  async function discover() {
    try { robots = (await read(new URL("/robots.txt", base).href)).text; } catch (e) { if (!(e instanceof StoreHttpError) || e.status !== 404) throw e; }
    const roots = [...robots.matchAll(/^sitemap:\s*(\S+)/gim)].map(m => m[1]).filter(u => !/sitemap_blog/i.test(u));
    if (!roots.length) roots.push(new URL("/sitemap.xml", base).href);
    const queue = [...roots], seen = new Set<string>(), urls = new Set<string>();
    while (queue.length) {
      const next = queue.shift()!; if (seen.has(next)) continue;
      if (seen.size >= 100 || urls.size > 20_000) throw new Error("El sitemap supera el límite de seguridad.");
      seen.add(next); const result = await read(next); const parsed = parseSitemap(result.text, result.url);
      parsed.urls.forEach(u => urls.add(u)); queue.push(...parsed.indexes);
    }
    return [...urls].filter(u => { const x = new URL(u); return allowedHosts.has(x.hostname) && robotsAllows(robots,x.pathname+x.search) && !/\/blog(?:\/|$)|\/sitemap|\/contacto\/?$/.test(x.pathname); });
  }
  return { read, discover, validate, setRobots: (value: string) => { robots = value; } };
}
