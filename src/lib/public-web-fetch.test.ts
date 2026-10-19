import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { fetchPublicText } from "./public-web-fetch";

function serve(chunks: Buffer[]) {
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200, headers: { "content-type": "text/html" }, destroyed: false,
    destroy(error?: Error) { response.destroyed = true; if (error) response.emit("error", error); },
  });
  mocks.request.mockImplementation((_url, _options, callback) => {
    const request = Object.assign(new EventEmitter(), { end() {
      callback(response);
      for (const chunk of chunks) { if (!response.destroyed) response.emit("data", chunk); }
      if (!response.destroyed) response.emit("end");
    } });
    return request;
  });
  return response;
}

beforeEach(() => vi.resetAllMocks());
describe("protección del lector web", () => {
  it("conserva exactamente el límite y cierra páginas grandes cuando se permite lectura parcial", async () => {
    const response = serve([Buffer.from("<title>Negocio</title>"), Buffer.alloc(2_100_000, "x")]);
    const result = await fetchPublicText(new URL("https://public.example"), AbortSignal.timeout(1000), 0, { allowPartial: true });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.html)).toBe(2_000_000);
    expect(result.html).toContain("<title>Negocio</title>");
    expect(response.destroyed).toBe(true);
  });
  it("mantiene el rechazo de páginas grandes para lectores que no optan por lectura parcial", async () => {
    serve([Buffer.alloc(2_000_001)]);
    await expect(fetchPublicText(new URL("https://public.example"), AbortSignal.timeout(1000))).rejects.toThrow("demasiado grande");
  });
  it("lee páginas completas debajo del límite sin marcarlas como parciales", async () => {
    serve([Buffer.from("<h1>Negocio</h1>")]);
    expect(await fetchPublicText(new URL("https://public.example"), AbortSignal.timeout(1000), 0, { allowPartial: true })).toMatchObject({ html: "<h1>Negocio</h1>" });
  });
  it.each(["http://localhost", "http://router.local", "https://user:pass@example.com", "http://example.com:8080"])("rechaza URL interna o incompatible %s", async value => {
    await expect(fetchPublicText(new URL(value), AbortSignal.timeout(1000))).rejects.toThrow();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "::1", "::ffff:127.0.0.1"])("rechaza DNS con dirección privada %s", async address => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }]);
    await expect(fetchPublicText(new URL("https://public.example"), AbortSignal.timeout(1000))).rejects.toThrow("internas");
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
