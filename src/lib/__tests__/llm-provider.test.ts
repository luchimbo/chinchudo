import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchChatCompletion, resolveLLMConfig, resolveLLMProvider } from "../llm-provider";
import { getRelayUrl } from "../settings";

vi.mock("../settings", () => ({ getRelayUrl: vi.fn() }));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.mocked(getRelayUrl).mockReset();
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

  it("falls back to OpenRouter with its own model when the local provider is unavailable", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://local-llm/v1";
    process.env.LLM_LOCAL_MODEL = "local-model";
    process.env.OPENROUTER_API_KEY = "remote-key";
    process.env.OPENROUTER_MODEL = "remote-model";
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("network unreachable"))
      .mockResolvedValueOnce(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(result.usedFallback).toBe(true);
    expect(result.config.provider).toBe("openrouter");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe("remote-model");
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

  it("does not send Ollama-only fields to OpenRouter, including on fallback", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "http://pcmidi.local:11434/v1";
    process.env.OPENROUTER_API_KEY = "remote-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("down", { status: 502 }))
      .mockResolvedValueOnce(new Response('{"choices":[{"message":{"content":"ok"}}]}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(result.usedFallback).toBe(true);
    expect(bodyOfCall(fetchMock, 1)).not.toHaveProperty("reasoning_effort");
    expect(bodyOfCall(fetchMock, 1)).not.toHaveProperty("think");
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
    vi.mocked(getRelayUrl).mockResolvedValue("https://current-tunnel.trycloudflare.com/");
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
    vi.mocked(getRelayUrl).mockResolvedValue("https://new-tunnel.trycloudflare.com");
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

    expect(getRelayUrl).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("http://pcmidi.local:11434/v1/chat/completions");
  });

  it("falls back to OpenRouter when relay mode has no relay URL", async () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_LOCAL_BASE_URL = "relay";
    process.env.OPENROUTER_API_KEY = "remote-key";
    process.env.OPENROUTER_MODEL = "remote-model";
    delete process.env.AGENT_RELAY_URL;
    vi.mocked(getRelayUrl).mockResolvedValue(undefined);
    const fetchMock = okFetch();

    const result = await fetchChatCompletion(resolveLLMConfig(), { messages: [] }, "test");

    expect(result.usedFallback).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});
