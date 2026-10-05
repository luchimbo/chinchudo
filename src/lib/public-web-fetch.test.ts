import { describe, expect, it, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));
import { fetchPublicText } from "./public-web-fetch";

beforeEach(() => vi.resetAllMocks());
describe("protección del lector web", () => {
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
