type LegacyClientLLMConfig = {
  openrouterApiKey?: string | null;
  openrouterModel?: string | null;
};

export type LLMProvider = "local" | "openrouter";

export type LLMConfig = {
  provider: LLMProvider;
  baseUrl: string;
  endpoint: string;
  model: string;
  apiKey: string;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function resolveLLMConfig(client?: LegacyClientLLMConfig | null): LLMConfig {
  const provider = process.env.LLM_PROVIDER?.trim().toLowerCase() === "local" ? "local" : "openrouter";

  if (provider === "local") {
    const baseUrl = normalizeBaseUrl(process.env.LLM_BASE_URL || "http://127.0.0.1:11434/v1");
    return {
      provider,
      baseUrl,
      endpoint: `${baseUrl}/chat/completions`,
      model: process.env.LLM_MODEL?.trim() || "qwen2.5:32b",
      apiKey: process.env.LLM_API_KEY?.trim() || "ollama",
    };
  }

  const baseUrl = normalizeBaseUrl(process.env.LLM_BASE_URL || OPENROUTER_BASE_URL);
  return {
    provider,
    baseUrl,
    endpoint: `${baseUrl}/chat/completions`,
    model: client?.openrouterModel?.trim() || process.env.LLM_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-lite",
    apiKey: client?.openrouterApiKey?.trim() || process.env.LLM_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "",
  };
}

export function llmHeaders(config: LLMConfig, title: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://los5apostoles.local";
    headers["X-Title"] = title;
  }
  return headers;
}
