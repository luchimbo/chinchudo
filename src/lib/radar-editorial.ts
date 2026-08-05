export type EditorialSignal = {
  id: string;
  title: string;
  description: string;
  sourceUrl: string;
  platform: string;
  createdAt: Date | string;
  metadata?: unknown;
};

export type EvaluatedEditorialSignal = EditorialSignal & {
  score: number;
  showInCopilot: boolean;
  allowHumor: boolean;
  reason: string;
};

const SENSITIVE_TERMS = /\b(muert[oe]s?|falleci(?:ó|o|eron)|tragedia|accidente|desaparecid[oa]s?|violencia|crimen|asesin|guerra|atentado|elecciones|presidente|congreso|dólar|dolar|inflación|inflacion|riesgo país|riesgo pais)\b/i;
const TREND_PLATFORMS = new Set(["GOOGLE_TRENDS", "TWITTER", "TIKTOK_CREATIVE_CENTER", "TIKTOK_HASHTAG", "X_CONVERSATION"]);
const ECONOMIC_PLATFORMS = new Set(["ARGENTINA_DATA", "ARGENTINE_PRESS", "GOOGLE_NEWS"]);

function metadataOf(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function evaluateEditorialSignal(signal: EditorialSignal, now = new Date()): EvaluatedEditorialSignal {
  const metadata = metadataOf(signal.metadata);
  const ageHours = Math.max(0, (now.getTime() - new Date(signal.createdAt).getTime()) / 3_600_000);
  const text = `${signal.title} ${signal.description}`;
  const explicitlySensitive = metadata.sensitivity === "needs_review" || SENSITIVE_TERMS.test(text);
  const isTrend = TREND_PLATFORMS.has(signal.platform);
  const isEconomicOrNews = ECONOMIC_PLATFORMS.has(signal.platform);
  const freshness = ageHours <= 12 ? 45 : ageHours <= 36 ? 30 : ageHours <= 72 ? 15 : 0;
  const relevance = isTrend ? 35 : signal.platform === "ARGENTINE_STREAMING_MEDIA" ? 26 : isEconomicOrNews ? 18 : 12;
  const safety = explicitlySensitive ? -55 : 20;
  const score = Math.max(0, freshness + relevance + safety);
  const showInCopilot = score >= 45 && ageHours <= 72;
  const allowHumor = showInCopilot && isTrend && !explicitlySensitive && ageHours <= 36;
  const reason = explicitlySensitive
    ? "Requiere revisión: tema sensible o de actualidad delicada."
    : allowHumor
      ? "Señal reciente y liviana: podría aportar un guiño si encaja."
      : isEconomicOrNews
        ? "Dato o noticia para contexto, no para forzar un guiño."
        : "Señal reciente para mirar antes de responder.";

  return { ...signal, score, showInCopilot, allowHumor, reason };
}

export function selectCopilotPulse(signals: EditorialSignal[], now = new Date(), limit = 5) {
  return signals
    .map((signal) => evaluateEditorialSignal(signal, now))
    .filter((signal) => signal.showInCopilot)
    .sort((a, b) => b.score - a.score || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function selectHumorSignal(signals: EditorialSignal[], now = new Date()) {
  return selectCopilotPulse(signals, now, 20).find((signal) => signal.allowHumor) ?? null;
}
