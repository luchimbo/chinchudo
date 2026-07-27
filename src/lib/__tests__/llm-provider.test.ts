import { afterEach, describe, expect, it } from "vitest";
import { resolveLLMConfig, resolveLLMProvider } from "../llm-provider";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("resolveLLMConfig", () => {
  it("uses the local OpenAI-compatible endpoint without client OpenRouter overrides", () => {
    process.env.LLM_PROVIDER = "local";
    process.env.LLM_BASE_URL = "http://192.168.1.200:11434/v1/";
    process.env.LLM_MODEL = "qwen2.5:32b";
    process.env.LLM_API_KEY = "ollama";

    expect(resolveLLMConfig({ openrouterModel: "remote/model", openrouterApiKey: "remote-key" })).toEqual({
      provider: "local",
      baseUrl: "http://192.168.1.200:11434/v1",
      endpoint: "http://192.168.1.200:11434/v1/chat/completions",
      model: "qwen2.5:32b",
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
});
