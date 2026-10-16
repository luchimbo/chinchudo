// Port de ig-viral/swipe.py: una referencia vale por cuánto le ganó a su propia
// cuenta, no por sus vistas absolutas.
import { classifyHook } from "./hook-formulas";
import { scoreHook } from "./hook-score";

export const OUTLIER_SIGNAL = 3;
export const OUTLIER_NOISE = 1.5;
export const MIN_MEDIAN_SAMPLES = 3;

export function median(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function outlierMultiple(views: number | null | undefined, channelMedian: number | null | undefined): number | null {
  if (!views || !channelMedian || channelMedian <= 0) return null;
  return Math.round((views / channelMedian) * 10) / 10;
}

export type OutlierBand = "signal" | "above" | "normal" | "unknown";

export function outlierBand(multiple: number | null | undefined): OutlierBand {
  if (multiple == null) return "unknown";
  if (multiple > OUTLIER_SIGNAL) return "signal";
  if (multiple >= OUTLIER_NOISE) return "above";
  return "normal";
}

export type ReelCraftTrendMeta = {
  views: number | null;
  channel: string | null;
  channelMedian: number | null;
  medianSamples: number;
  outlierMultiple: number | null;
  band: OutlierBand;
  formulaId: number | null;
  formulaName: string | null;
  hookScore: number;
  hookVerdict: string;
};

/** Limpia el prefijo que agrega el radar ("YouTube/Shorts: ...") antes de leer el hook. */
export function referenceHook(title: string): string {
  return title.replace(/^[\p{L}/ ]{2,30}:\s+/u, "").trim();
}

export function analyzeReference({ title, views, channel, channelViews }: { title: string; views: number | null; channel: string | null; channelViews: number[] }): ReelCraftTrendMeta {
  const hook = referenceHook(title);
  const formula = classifyHook(hook);
  const score = scoreHook(hook);
  const samples = channelViews.filter((value) => value > 0);
  const channelMedian = samples.length >= MIN_MEDIAN_SAMPLES ? median(samples) : null;
  const multiple = outlierMultiple(views, channelMedian);
  return {
    views: views ?? null,
    channel: channel ?? null,
    channelMedian,
    medianSamples: samples.length,
    outlierMultiple: multiple,
    band: outlierBand(multiple),
    formulaId: formula?.id ?? null,
    formulaName: formula?.name ?? null,
    hookScore: score.score,
    hookVerdict: score.verdict,
  };
}

export function readReelCraftMeta(metadata: unknown): Partial<ReelCraftTrendMeta> {
  if (!metadata || typeof metadata !== "object") return {};
  const value = (metadata as Record<string, unknown>).reelCraft;
  return value && typeof value === "object" ? (value as Partial<ReelCraftTrendMeta>) : {};
}

/** Orden para elegir referencias: primero las que le ganaron 3x a su cuenta. */
export function referenceRank(trend: { metadata: unknown; viabilityScore: number }): number {
  const meta = readReelCraftMeta(trend.metadata);
  const band = meta.band ?? "unknown";
  const bandWeight = band === "signal" ? 3 : band === "above" ? 2 : band === "unknown" ? 1 : 0;
  return bandWeight * 100 + trend.viabilityScore * 10 + (meta.hookScore ?? 0) / 10;
}
