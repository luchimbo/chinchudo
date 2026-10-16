// Utilidades de texto compartidas por reel-craft.
// Port en español rioplatense de jakeschincariol/instagram-agent-skill (MIT).

const WORD_CHAR = "[\\p{L}\\p{N}_]";
const UNICODE_BOUNDARY = `(?:(?<!${WORD_CHAR})(?=${WORD_CHAR})|(?<=${WORD_CHAR})(?!${WORD_CHAR}))`;

/**
 * RegExp con `\b` que entiende acentos y ñ. En JS `\b` solo conoce ASCII,
 * así que "más" o "tenés" nunca cerrarían una palabra.
 */
export function ure(source: string, flags = "iu"): RegExp {
  return new RegExp(source.replace(/\\b/g, UNICODE_BOUNDARY), flags.includes("u") ? flags : `${flags}u`);
}

const WORD_RE = /[\p{L}\p{N}$%'’-]+/gu;

/** "18.000" y "$18,000" se dicen como una sola palabra, así que cuentan como una. */
export function joinThousands(text: string): string {
  return text.replace(/(?<=\d)[.,](?=\d{3}(?!\d))/g, "");
}

export function words(text: string): string[] {
  return joinThousands(text).match(WORD_RE) ?? [];
}

export function lowerWords(text: string): string[] {
  return words(text).map((word) => word.toLowerCase().replace(/^['’]+|['’]+$/g, ""));
}

export function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Mapea `value` a 0-100 donde `human` vale 100 y `machine` vale 0. */
export function scale(value: number, human: number, machine: number): number {
  if (human === machine) return 50;
  return clamp(((value - machine) / (human - machine)) * 100);
}

export const NUMBER_RE = ure(
  "\\$\\s?\\d[\\d.,]*|\\b\\d[\\d.,]*\\s?(?:%|k\\b|x\\b|hs?\\b|horas?\\b|min(?:utos)?\\b|seg(?:undos)?\\b|d[ií]as?\\b|semanas?\\b|mes(?:es)?\\b|a[ñn]os?\\b|cuotas\\b)?",
  "giu",
);

/** Palabra con mayúscula que no abre línea ni oración: marca, modelo, nombre propio. */
export const PROPER_RE = /(?<![.!?¿¡]\s*)(?<!^)(?<![\p{L}\p{N}])\p{Lu}[\p{Ll}\p{Lu}]{2,}(?![\p{L}\p{N}])/gmu;

export const EMOJI_RE = /\p{Extended_Pictographic}/u;
export const HASHTAG_RE = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

export function timecode(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}
