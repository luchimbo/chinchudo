import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./public-web-fetch", async importOriginal => ({ ...await importOriginal<typeof import("./public-web-fetch")>(), fetchPublicText: mocks.read }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { analyzePublicWebsite } from "./onboarding";

beforeEach(() => vi.clearAllMocks());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("lectura de negocios", () => {
  it("la lectura básica usa categorías y redes del menú sin recorrer las fichas ni el sitemap", async () => {
    const paths: string[] = [];
    mocks.read.mockImplementation(async (url: URL) => {
      paths.push(url.pathname);
      if (url.pathname === "/robots.txt") return { url, html: "User-agent: *\nDisallow: /account" };
      if (url.pathname !== "/") return { url, html: "<title>Casa Norte</title><main>Muebles para el hogar</main>" };
      return { url, truncated: true, html: '<title>Casa Norte</title><meta name="description" content="Muebles para el hogar"><nav><a href="/collections/sillas">Sillas</a><a href="/collections/mesas">Mesas</a><a href="/products/modelo-1">Modelo 1</a></nav><a href="/nosotros">Nosotros</a><footer><a href="https://instagram.com/casanorte">Instagram</a></footer><script type="application/ld+json">{"@type":"Product","name":"Modelo 1","category":"Sillas","offers":{"price":100}}</script>' };
    });
    const result = await analyzePublicWebsite("https://negocio.example", "Casa Norte", { mode: "basic", skipSuggestions: true });
    expect(result.draft.offer).toContain("Sillas");
    expect(result.draft.priorities).toEqual(expect.arrayContaining(["Sillas", "Mesas"]));
    expect(result.draft.selectedNetworks).toEqual(["Instagram"]);
    expect(result.draft.offerings).toEqual([]);
    expect(result.draft.stats).toMatchObject({ catalogStatus: "deferred", catalogNextOffset: 0, catalogSyncPending: false });
    expect(result.warning).toContain("extensa");
    expect(paths).not.toContain("/sitemap.xml");
    expect(paths).not.toContain("/products/modelo-1");
    expect(paths.indexOf("/nosotros")).toBeLessThan(paths.indexOf("/collections/sillas"));
  });
  it("entrega la portada aunque las páginas secundarias no respondan", async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("Tiempo agotado")), ms);
      return controller.signal;
    });
    mocks.read.mockImplementation(async (url: URL) => {
      if (url.pathname === "/") return { url, html: '<title>Negocio</title><meta name="description" content="Muebles para el hogar"><a href="/nosotros">Nosotros</a>' };
      if (url.pathname === "/robots.txt") throw new Error("404");
      return new Promise(() => {});
    });
    const promise = analyzePublicWebsite("https://negocio.example", "Negocio", { mode: "basic", skipSuggestions: true });
    await vi.advanceTimersByTimeAsync(35_000);
    const result = await promise;
    expect(result.pages).toHaveLength(1);
    expect(result.draft.description).toBe("Muebles para el hogar");
    expect(result.draft.stats.durationMs).toBeLessThanOrEqual(35_000);
  });
  it.each([[["Product"], "products"], [["Service"], "services"], [["Product", "Service"], "mixed"]] as const)("extrae oferta estructurada %j", async (types, expected) => {
    mocks.read.mockImplementation(async (url: URL) => {
      if (url.pathname !== "/") throw new Error("404");
      const data = types.map((type, i) => ({ "@type": type, name: `Oferta ${i}`, description: "Oferta respaldada por esta página", category: "Música" }));
      return { url, html: `<title>Mi negocio</title><meta name="description" content="Productos y servicios musicales"><h1>Mi negocio</h1><script type="application/ld+json">${JSON.stringify(data)}</script>` };
    });
    const result = await analyzePublicWebsite("https://negocio.example", "Mi negocio", { skipSuggestions: true });
    expect(result.draft.detectedBusinessType).toBe(expected);
    expect(result.draft.offerings).toHaveLength(types.length);
    expect(result.pages[0].seo?.structuredTypes).toEqual(types);
  });
  it("conserva resultados parciales y respeta el límite de páginas", async () => {
    const read: string[] = [];
    mocks.read.mockImplementation(async (url: URL) => {
      read.push(url.pathname);
      if (url.pathname === "/") return { url, html: '<title>Negocio</title><h1>Negocio</h1><a href="/productos/a">A</a><a href="/productos/b">B</a><a href="/productos/c">C</a>' };
      if (url.pathname !== "/productos/b") throw new Error("Inaccesible");
      return { url, html: "<title>Producto B</title><h1>Producto B</h1>" };
    });
    const result = await analyzePublicWebsite("https://negocio.example", "Negocio", { maxPages: 3, skipSuggestions: true });
    expect(result.pages.map(p => new URL(p.url).pathname)).toEqual(["/", "/productos/b"]);
    expect(read).not.toContain("/productos/c");
  });
  it("informa sitios inaccesibles sin inventar un perfil", async () => {
    mocks.read.mockRejectedValue(new Error("El sitio respondió 503."));
    await expect(analyzePublicWebsite("https://negocio.example", "Negocio", { skipSuggestions: true })).rejects.toThrow("503");
  });
});
