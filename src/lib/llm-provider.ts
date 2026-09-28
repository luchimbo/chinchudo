export type LegacyClientLLMConfig = {
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
const LOCAL_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";
// Modelo disponible en el servidor Ollama compartido. Se puede sobrescribir
// por entorno para otra instalación compatible con OpenAI.
const LOCAL_DEFAULT_MODEL = "qwen3.8:latest";

type ProviderMode = LLMProvider | "schedule";

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function configuredProvider(): ProviderMode {
  const value = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (value === "local" || value === "openrouter") return value;
  return "schedule";
}

function localScheduleActive(now: Date): boolean {
  const timezone = process.env.LLM_SCHEDULE_TIMEZONE?.trim() || "America/Argentina/Buenos_Aires";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const current = hour * 60 + minute;
  const start = parseScheduleTime(process.env.LLM_LOCAL_START, 9 * 60 + 30);
  const end = parseScheduleTime(process.env.LLM_LOCAL_END, 17 * 60 + 30);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function parseScheduleTime(value: string | undefined, fallback: number): number {
  const match = value?.trim().match(/^(?:[01]?\d|2[0-3]):[0-5]\d$/);
  if (!match) return fallback;
  const [hours, minutes] = match[0].split(":").map(Number);
  return hours * 60 + minutes;
}

export function resolveLLMProvider(now = new Date()): LLMProvider {
  const configured = configuredProvider();
  return configured === "schedule" ? (localScheduleActive(now) ? "local" : "openrouter") : configured;
}

export function resolveLLMConfig(client?: LegacyClientLLMConfig | null, now = new Date()): LLMConfig {
  const provider = resolveLLMProvider(now);

  if (provider === "local") {
    const baseUrl = normalizeBaseUrl(process.env.LLM_LOCAL_BASE_URL || process.env.LLM_BASE_URL || LOCAL_DEFAULT_BASE_URL);
    return {
      provider,
      baseUrl,
      endpoint: `${baseUrl}/chat/completions`,
      model: process.env.LLM_LOCAL_MODEL?.trim() || process.env.LLM_MODEL?.trim() || LOCAL_DEFAULT_MODEL,
      apiKey: process.env.LLM_LOCAL_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || "ollama",
    };
  }

  return resolveOpenRouterConfig(client);
}

export function resolveOpenRouterConfig(client?: LegacyClientLLMConfig | null): LLMConfig {
  const baseUrl = normalizeBaseUrl(process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL);
  return {
    provider: "openrouter",
    baseUrl,
    endpoint: `${baseUrl}/chat/completions`,
    model: client?.openrouterModel?.trim() || process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-lite",
    apiKey: client?.openrouterApiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim() || "",
  };
}

/**
 * Vercel no llega a la LAN: ahí la IA local se consume a través del relay, cuya
 * URL trycloudflare cambia en cada reinicio y vive en AppSetting AGENT_RELAY_URL
 * (la actualiza start-relay.mjs). Se activa con LLM_LOCAL_BASE_URL="relay" o con
 * una URL *.trycloudflare.com heredada, que queda vieja apenas se reinicia el túnel.
 */
function usesRelayForLocal(baseUrl: string): boolean {
  if (baseUrl.toLowerCase() === "relay") return true;
  try {
    return new URL(baseUrl).hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

async function resolveLocalEndpoint(config: LLMConfig): Promise<LLMConfig> {
  if (config.provider !== "local" || !usesRelayForLocal(config.baseUrl)) return config;
  // Import diferido: sólo este modo necesita la DB, y los scripts locales no.
  const { getRelayUrl } = await import("./settings");
  const relayUrl = await getRelayUrl();
  if (!relayUrl) {
    if (config.baseUrl.toLowerCase() === "relay") throw new Error("La IA local usa el relay, pero AGENT_RELAY_URL no está configurado.");
    return config;
  }
  const baseUrl = `${normalizeBaseUrl(relayUrl)}/v1`;
  return {
    ...config,
    baseUrl,
    endpoint: `${baseUrl}/chat/completions`,
    // El relay valida su propio token; LLM_LOCAL_API_KEY queda por compatibilidad.
    apiKey: process.env.AGENT_RELAY_TOKEN?.trim() || config.apiKey,
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

export async function fetchChatCompletion(
  config: LLMConfig,
  payload: Record<string, unknown>,
  title: string,
  client?: LegacyClientLLMConfig | null,
  init?: Pick<RequestInit, "signal">,
): Promise<{ response: Response; config: LLMConfig; usedFallback: boolean }> {
  const request = async (activeConfig: LLMConfig) => fetch(activeConfig.endpoint, {
    method: "POST",
    headers: llmHeaders(activeConfig, title),
    body: JSON.stringify({ ...payload, model: activeConfig.model }),
    ...init,
  });

  try {
    const activeConfig = await resolveLocalEndpoint(config);
    const response = await request(activeConfig);
    if (response.ok || config.provider !== "local") return { response, config: activeConfig, usedFallback: false };

    const fallback = resolveOpenRouterConfig(client);
    if (!fallback.apiKey) return { response, config, usedFallback: false };
    console.warn(`[LLM] Local HTTP ${response.status}; se usa OpenRouter como respaldo para ${title}.`);
    return { response: await request(fallback), config: fallback, usedFallback: true };
  } catch (error) {
    // Una cancelacion expresa del operador no es una falla del proveedor local.
    // Reintentar contra OpenRouter ignora la intencion de cancelar y duplica la
    // solicitud, incluso cuando el request original ya recibio la signal.
    if (init?.signal?.aborted) throw error;
    if (config.provider !== "local") throw error;
    const fallback = resolveOpenRouterConfig(client);
    if (!fallback.apiKey) throw error;
    console.warn(`[LLM] El proveedor local no respondió; se usa OpenRouter como respaldo para ${title}.`);
    return { response: await request(fallback), config: fallback, usedFallback: true };
  }
}
