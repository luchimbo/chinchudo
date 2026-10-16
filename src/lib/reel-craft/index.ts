// reel-craft: el método de ig-reel / ig-viral / ig-caption / ig-human
// (jakeschincariol/instagram-agent-skill, MIT) aplicado a tendencias y guiones.
import { buildBeatSheet, onScreenCards, type BeatSheet } from "./beat-sheet";
import { lintCaption, type CaptionReport } from "./caption";
import { classifyHook, getFormula } from "./hook-formulas";
import { HOOK_MIN_SCORE, scoreHook, type HookScore } from "./hook-score";
import { humanizeText, scoreHumanness, type HumanScore } from "./humanize";

export * from "./beat-sheet";
export * from "./caption";
export * from "./hook-formulas";
export * from "./hook-score";
export * from "./humanize";
export * from "./outlier";
export { timecode } from "./text";

export const DEFAULT_TARGET_SECONDS = 30;

export type HookOption = { formulaId: number | null; formulaName: string | null; spoken: string; onScreen: string; score: number; verdict: HookScore["verdict"]; weakest: HookScore["weakest"]; flags: string[] };

export type ScriptQualityReport = {
  version: 1;
  hook: HookOption;
  hookOptions: HookOption[];
  beatSheet: BeatSheet | null;
  caption: CaptionReport;
  human: HumanScore & { changes: number; replaced: string[]; structuralTells: string[] };
  ready: boolean;
  problems: string[];
  summary: string;
};

export type DraftBeat = { spoken: string; onScreen?: string };

function toOption(option: { formulaId?: number | null; spoken: string; onScreen?: string }): HookOption {
  const score = scoreHook(option.spoken);
  const formula = getFormula(option.formulaId ?? null) ?? classifyHook(option.spoken);
  return { formulaId: formula?.id ?? null, formulaName: formula?.name ?? null, spoken: option.spoken, onScreen: option.onScreen ?? "", score: score.score, verdict: score.verdict, weakest: score.weakest, flags: score.flags };
}

/** Puntúa y ordena las opciones de hook; la primera es la que se graba. */
export function rankHookOptions(options: { formulaId?: number | null; spoken: string; onScreen?: string }[]): HookOption[] {
  return options.filter((option) => option.spoken?.trim()).map(toOption).sort((a, b) => b.score - a.score);
}

/**
 * Arma el reporte completo de un guion: hook elegido, beat sheet, caption y
 * puntaje de humanidad. Sirve para el guion recién generado y para uno editado.
 */
export function buildScriptQualityReport(input: { hookOptions: { formulaId?: number | null; spoken: string; onScreen?: string }[]; beats: DraftBeat[]; caption: string; hashtags?: string[]; target?: number }): ScriptQualityReport {
  const ranked = rankHookOptions(input.hookOptions);
  const hook = ranked[0] ?? toOption({ spoken: "" });
  const beatSheet = buildBeatSheet([{ spoken: hook.spoken, onScreen: hook.onScreen }, ...input.beats], { target: input.target ?? DEFAULT_TARGET_SECONDS });
  const caption = lintCaption(input.caption, input.hashtags);
  const spokenText = [hook.spoken, ...input.beats.map((beat) => beat.spoken)].join("\n");
  const cleaned = humanizeText(spokenText);
  const human = { ...scoreHumanness(spokenText), changes: cleaned.changes, replaced: cleaned.replaced, structuralTells: cleaned.structuralTells };

  const problems: string[] = [];
  if (hook.score < HOOK_MIN_SCORE) problems.push(`El mejor hook puntúa ${hook.score} (mínimo ${HOOK_MIN_SCORE}). Débil en ${hook.weakest}.`);
  for (const flag of hook.flags) problems.push(flag);
  if (beatSheet && !beatSheet.clean) problems.push(...beatSheet.beats.flatMap((beat) => beat.flags.map((flag) => `Beat ${beat.n}: ${flag}`)), ...beatSheet.notes.filter((note) => note.startsWith("Sin loop")));
  if (!caption.ok) problems.push(...caption.checks.filter((check) => check.status === "FAIL").map((check) => `Caption: ${check.detail}`));
  if (cleaned.replaced.length) problems.push(`Frases de manual: ${cleaned.replaced.join(", ")}.`);

  const cards = beatSheet ? onScreenCards(beatSheet).length : 0;
  const summary = [
    `hook:       ${hook.formulaId ? `#${hook.formulaId} ${hook.formulaName}` : "sin fórmula"}, ${hook.score} ${hook.verdict}`,
    beatSheet ? `duración:   ${beatSheet.totalSeconds.toFixed(1)}s en ${beatSheet.beats.length} beats a ${beatSheet.wpm} ppm` : "duración:   sin guion",
    `en pantalla: ${cards} tarjetas`,
    `humanidad:  ${human.score} ${human.verdict}${cleaned.changes ? ` (${cleaned.changes} artefacto(s) para limpiar)` : ""}`,
    `caption:    ${caption.ok ? "OK" : "revisar"}, ${caption.hashtags.length} hashtag(s)`,
  ].join("\n");

  return { version: 1, hook, hookOptions: ranked, beatSheet, caption, human, ready: problems.length === 0, problems, summary };
}

/**
 * Reconstruye beats desde un guion guardado como texto (cuerpo / CTA). Si el
 * reporte anterior tenía tarjetas en pantalla para la misma línea, las conserva.
 */
export function beatsFromScriptText(bodyText: string, cta: string, previous?: BeatSheet | null): DraftBeat[] {
  const cards = new Map((previous?.beats ?? []).filter((beat) => beat.onScreen).map((beat) => [beat.text.trim(), beat.onScreen as string]));
  return [...bodyText.split(/\r?\n/), cta].map((line) => line.trim()).filter(Boolean).map((spoken) => ({ spoken, onScreen: cards.get(spoken) }));
}

export const CARDS_HEADER = "Tarjetas en pantalla:";

/** Reemplaza (o agrega) el bloque de tarjetas con timecode dentro de `visualCues`. */
export function withOnScreenCards(visualCues: string, sheet: BeatSheet | null): string {
  const cards = sheet ? onScreenCards(sheet) : [];
  const rest = visualCues.startsWith(CARDS_HEADER) ? visualCues.split(/\r?\n\r?\n/).slice(1).join("\n\n") : visualCues;
  return [cards.length ? `${CARDS_HEADER}\n${cards.join("\n")}` : "", rest].filter(Boolean).join("\n\n");
}
