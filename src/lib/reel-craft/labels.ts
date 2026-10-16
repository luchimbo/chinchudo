// Textos en español para mostrar. Los códigos (STRONG, HOOK, LENGTH…) quedan
// en inglés solo como claves internas y en el JSON guardado en qualityReport.
import type { BeatLabel } from "./beat-sheet";
import type { CaptionCheck } from "./caption";
import type { HookCheck, HookVerdict } from "./hook-score";
import type { HumanCheck, HumanScore } from "./humanize";

export const HOOK_VERDICT_LABEL: Record<HookVerdict, string> = { STRONG: "Fuerte", OK: "Aceptable", WEAK: "Débil" };
export const HUMAN_VERDICT_LABEL: Record<HumanScore["verdict"], string> = { PASS: "Suena humano", REVIEW: "Revisar", FLAGGED: "Suena artificial" };
export const CAPTION_STATUS_LABEL: Record<CaptionCheck["status"], string> = { PASS: "Bien", WARN: "Ojo", FAIL: "Corregir" };

export const HOOK_CHECK_LABEL: Record<HookCheck, string> = {
  LENGTH: "largo",
  SPECIFICITY: "datos concretos",
  STAKES: "algo en juego",
  FRONTLOAD: "arranque",
  ADDRESS: "a quién le habla",
};

export const HUMAN_CHECK_LABEL: Record<HumanCheck, string> = {
  BURSTINESS: "variedad de oraciones",
  SPECIFICITY: "datos concretos",
  SLOP: "frases de manual",
  FINGERPRINT: "huella tipográfica",
  VOICE: "voz propia",
};

export const BEAT_LABEL: Record<Exclude<BeatLabel, "">, string> = { HOOK: "Gancho", MID: "Mitad", CTA: "Cierre", "HOOK/CTA": "Gancho y cierre" };

/** Etiqueta para cualquier veredicto guardado (gancho, humanidad o descripción). */
export function verdictLabel(verdict: string): string {
  return (HOOK_VERDICT_LABEL as Record<string, string>)[verdict] ?? (HUMAN_VERDICT_LABEL as Record<string, string>)[verdict] ?? (CAPTION_STATUS_LABEL as Record<string, string>)[verdict] ?? verdict;
}

export function beatLabel(label: BeatLabel, n: number): string {
  return label ? BEAT_LABEL[label] : String(n);
}
