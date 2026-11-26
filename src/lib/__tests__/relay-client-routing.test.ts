import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSetting: vi.fn(), getRelayUrl: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting, getRelayUrl: mocks.getRelayUrl }));

import { relayFetch } from "@/lib/relay-client";

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("{}"));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AGENT_RELAY_TOKEN", "token");
  vi.stubGlobal("fetch", fetchMock);
  mocks.getRelayUrl.mockResolvedValue("https://pc-relay.trycloudflare.com");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("a dónde va cada pedido de la web", () => {
  it("la búsqueda manual va al servidor pcmidi", async () => {
    mocks.getSetting.mockResolvedValue("https://server.trycloudflare.com/");
    await relayFetch("/search/run", { method: "POST" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://server.trycloudflare.com/search/run");
  });

  it("sin dirección del servidor, la búsqueda usa el relay de la PC", async () => {
    mocks.getSetting.mockResolvedValue(null);
    await relayFetch("/search/run", { method: "POST" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://pc-relay.trycloudflare.com/search/run");
  });

  it("el blog nunca cae al relay de la PC y los logins siguen en la PC", async () => {
    mocks.getSetting.mockResolvedValue(null);
    await expect(relayFetch("/blog/publish", { method: "POST" })).rejects.toThrow("blog_runtime_relay_url");
    mocks.getSetting.mockResolvedValue("https://server.trycloudflare.com");
    await relayFetch("/login-status");
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe("https://pc-relay.trycloudflare.com/login-status");
  });
});
