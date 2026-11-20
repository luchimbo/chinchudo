import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSetting: vi.fn(), getRelayUrl: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getSetting: mocks.getSetting, getRelayUrl: mocks.getRelayUrl }));

import { PREVIEW_UNAVAILABLE, renderLandingHtml } from "@/lib/landing-html";

const client = { id: "c1", name: "PC MIDI", slug: "pcmidi", storeUrl: "", blogBaseUrl: "https://blog.test", labName: "", logoUrl: "", landingTemplate: "", landingPrimaryColor: "", landingSecondaryColor: "" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("AGENT_RELAY_TOKEN", "token");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getSetting.mockResolvedValue("https://runtime.trycloudflare.com/");
  mocks.getRelayUrl.mockResolvedValue("https://relay.trycloudflare.com");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("vista previa a través del relay", () => {
  it("usa el runtime del blog cuando responde", async () => {
    fetchMock.mockResolvedValue(new Response("<!DOCTYPE html><html>ok</html>"));
    expect(await renderLandingHtml(client, "a1", { h1: "x" })).toContain("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://runtime.trycloudflare.com/landings/preview");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("no usa el relay local para la vista previa", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const error = await renderLandingHtml(client, "a1").catch((reason: Error) => reason);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://runtime.trycloudflare.com/landings/preview");
    expect((error as Error).message.split("\n")[0]).toBe(PREVIEW_UNAVAILABLE);
    expect((error as Error).message).toContain("fetch failed");
  });
});
