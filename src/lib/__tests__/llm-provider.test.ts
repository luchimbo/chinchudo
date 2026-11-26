import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChatCompletion, resolveLLMConfig, resolveLLMProvider } from "../llm-provider";
import { getLocalLlmRelayUrl } from "../settings";

vi.mock("../settings", () => ({ getLocalLlmRelayUrl: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.mocked(getLocalLlmRelayUrl).mockReset();
});

describe("resolveLLMConfig", () => {
  it("uses the local OpenAI-compatible endpoint without client OpenRouter overrides", () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_BASE_URL = "http://192.168.1.104:11434/v1/";
    process.env.LLM_MODEL = "qwen3.8:latest";
    process.env.LLM_API_KEY = "ollama";

    expect(resolveLLMConfig({ openrouterModel: "remote/model", openrouterApiKey: "remote-key" })).toEqual({
      provider: "local",
      baseUrl: "http://192.168.1.104:11434/v1",
      endpoint: "http://192.168.1.104:11434/v1/chat/completions",
      model: "qwen3.8:latest",
      apiKey: "ollama",
    });
  });

  it("keeps legacy client overrides for OpenRouter", () => {
    process.env.LLM_PROVIDER = "openrouter";
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_API_KEY;

    const config = resolveLLMConfig({ openrouterModel: "remote/model", openrouterApiKey: "remote-key" });
    expect(config.endpoint).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(config.model).toBe("remote/model");
    expect(config.apiKey).toBe("remote-key");
  });

  it("uses local IA from 09:30 until 17:30 Buenos Aires time", () => {
    process.env.LLM_PROVIDER = "schedule";
    process.env.LLM_SCHEDULE_TIMEZONE = "America/Argentina/Buenos_Aires";
    expect(resolveLLMProvider(new Date("2026-07-24T12:30:00Z"))).toBe("local"); // 09:30 ART
    expect(resolveLLMProvider(new Date("2026-07-24T20:30:00Z"))).toBe("openrouter"); // 17:30 ART
  });

  it("uses qwen when nothing is configured: there is no OpenRouter by default", () => {
    delete process.env.LLM_PROVIDER;
    expect(resolveLLMProvider(new Date("2026-07-24T03:00:00Z"))).toBe("local"); // 00:00 ART, outside the old window
  });

  it("never falls back to OpenRouter when qwen is unavailable", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://local-llm/v1";
    process.env.OPENROUTER_API_KEY = "remote-key";
    const unreachable = vi.fn().mockRejectedValue(new TypeError("network unreachable"));
    vi.stubGlobal("fetch", unreachable);
    await expect(fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test")).rejects.toThrow("network unreachable");
    expect(unreachable).toHaveBeenCalledTimes(1);

    const busy = vi.fn().mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", busy);
    const result = await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");
    expect(result.response.status).toBe(503);
    expect(result.config.provider).toBe("local");
    expect(busy).toHaveBeenCalledTimes(1);
  });
});
describe("reasoning of local models", () => {
  function bodyOfCall(fetchMock: ReturnType<typeof vi.fn>, index = 0) {
    return JSON.parse(fetchMock.mock.calls[index][1].body);
  }

  it("turns reasoning off for local models, which Ollama only honors via reasoning_effort", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://pcmidi.local:11434/v1";
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(bodyOfCall(fetchMock)).toMatchObject({ reasoning_effort: "none", think: false });
  });

  it("lets a caller ask for reasoning explicitly", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://pcmidi.local:11434/v1";
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChatCompletion(resolveLLMConfig(), { messages: [], reasoning_effort: "high" }, "test");

    expect(bodyOfCall(fetchMock).reasoning_effort).toBe("high");
  });

  it("turns OpenRouter reasoning off unless the caller asks for it", async () => {
    process.env.LLM_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "remote-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");
    await fetchChatCompletion(resolveLLMConfig(), { messages: [], reasoning: { effort: "low" } }, "test");

    expect(bodyOfCall(fetchMock, 0).reasoning).toEqual({ enabled: false });
    expect(bodyOfCall(fetchMock, 1).reasoning).toEqual({ effort: "low" });
  });
});

describe("local IA through the relay", () => {
  function okFetch() {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("follows the current relay URL from the DB when LLM_LOCAL_BASE_URL is 'relay'", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "relay";
    process.env.LLM_LOCAL_API_KEY = "legacy-key";
    process.env.AGENT_RELAY_TOKEN = "relay-token";
    vi.mocked(getLocalLlmRelayUrl).mockResolvedValue("https://current-tunnel.trycloudflare.com/");
    const fetchMock = okFetch();

    const result = await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(result.usedFallback).toBe(false);
    expect(fetchMock.mock.calls[0][0]).toBe("https://current-tunnel.trycloudflare.com/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer relay-token");
  });

  it("replaces a stale trycloudflare URL with the one the relay last registered", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "https://old-tunnel.trycloudflare.com/v1";
    process.env.LLM_LOCAL_API_KEY = "relay-token-from-vercel";
    delete process.env.AGENT_RELAY_TOKEN;
    vi.mocked(getLocalLlmRelayUrl).mockResolvedValue("https://new-tunnel.trycloudflare.com");
    const fetchMock = okFetch();

    await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(fetchMock.mock.calls[0][0]).toBe("https://new-tunnel.trycloudflare.com/v1/chat/completions");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer relay-token-from-vercel");
  });

  it("calls a LAN Ollama directly without reading the DB", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://pcmidi.local:11434/v1";
    const fetchMock = okFetch();

    await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(getLocalLlmRelayUrl).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("http://pcmidi.local:11434/v1/chat/completions");
  });

  it.each(["http", "connection"])("supports a single provider attempt after a local %s failure", async failure => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://pcmidi.local:11434/v1";
    process.env.OPENROUTER_API_KEY = "remote-key";
    const fetchMock = failure === "http" ? vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })) : vi.fn().mockRejectedValue(new Error("Unavailable"));
    vi.stubGlobal("fetch", fetchMock);
    const attempt = fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test", undefined, undefined, { allowFallback: false });
    if (failure === "http") expect((await attempt).usedFallback).toBe(false);
    else await expect(attempt).rejects.toThrow("Unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails instead of using OpenRouter when relay mode has no relay URL", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "relay";
    process.env.OPENROUTER_API_KEY = "remote-key";
    delete process.env.AGENT_RELAY_URL;
    vi.mocked(getLocalLlmRelayUrl).mockResolvedValue(undefined);
    const fetchMock = okFetch();

    await expect(fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test")).rejects.toThrow("relay");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
