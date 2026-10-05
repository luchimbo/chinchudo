import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./public-web-fetch", () => ({ fetchPublicText: mocks.read }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));
vi.mock("./logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { analyzePublicWebsite } from "./onboarding";

beforeEach(() => vi.clearAllMocks());
describe("lectura de negocios", () => {
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
