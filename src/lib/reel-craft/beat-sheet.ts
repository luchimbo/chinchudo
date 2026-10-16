// Port de ig-reel/beats.py: convierte un guion en una beat sheet con timecodes
// estimados por cantidad de palabras y marca lo que mata un Reel en la edición.
import { lowerWords, timecode, words } from "./text";

export type BeatLabel = "" | "HOOK" | "MID" | "CTA" | "HOOK/CTA";

export type Beat = {
  n: number;
  start: number;
  dur: number;
  words: number;
  text: string;
  onScreen?: string;
  concrete: number;
  label: BeatLabel;
  flags: string[];
};

export type BeatSheet = {
  wpm: number;
  target: number | null;
  totalSeconds: number;
  totalWords: number;
  beats: Beat[];
  notes: string[];
  /** true si no quedó ningún flag que haya que arreglar antes de grabar. */
  clean: boolean;
};

export const HOOK_WINDOW = 3;
export const MAX_BEAT = 4;
const ABSTRACT_RUN = 3;

const SENT_RE = /[^.!?]+[.!?]*/g;
const CONCRETE_RE = /\$\s?\d|(?<![\p{L}\p{N}])\d[\d.,]*(?![\p{L}\p{N}])|(?<![.!?¿¡]\s*)(?<!^)(?<![\p{L}\p{N}])\p{Lu}[\p{Ll}\p{Lu}]{2,}(?![\p{L}\p{N}])|\{\{dato\}\}/gmu;

const STOPWORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "pero", "si", "de", "del", "a", "al", "en", "por", "para", "con", "sin", "que", "qué", "esto", "este", "esta", "eso", "es",
  "son", "fue", "era", "ser", "está", "están", "vos", "te", "tu", "tus", "yo", "me", "mi", "mis", "nos", "lo", "le", "les", "se", "su", "sus", "ya", "no", "sí", "más", "muy", "como", "cómo",
  "hay", "tiene", "tenés", "hace", "hacé", "va", "vas", "sea", "todo", "todos", "uno", "ahí", "acá",
]);

function concreteCount(text: string): number {
  return text.match(CONCRETE_RE)?.length ?? 0;
}

function splitLine(line: string, wps: number): string[] {
  if (words(line).length / wps <= MAX_BEAT * 1.5) return [line];
  const parts = (line.match(SENT_RE) ?? []).map((part) => part.trim()).filter(Boolean);
  const beats: string[] = [];
  let buffer = "";
  for (const part of parts) {
    const candidate = `${buffer} ${part}`.trim();
    if (buffer && words(candidate).length / wps > MAX_BEAT) {
      beats.push(buffer);
      buffer = part;
    } else {
      buffer = candidate;
    }
  }
  if (buffer) beats.push(buffer);
  return beats;
}

export type BeatInput = string | { spoken: string; onScreen?: string };

/**
 * Acepta el guion como texto (un beat por línea) o como lista de beats con su
 * tarjeta en pantalla. Devuelve null si no hay nada que medir.
 */
export function buildBeatSheet(input: string | BeatInput[], { wpm = 165, target = null as number | null } = {}): BeatSheet | null {
  const wps = wpm / 60;
  const entries: { spoken: string; onScreen?: string }[] = typeof input === "string"
    ? input.split(/\r?\n/).map((line) => ({ spoken: line.trim() }))
    : input.map((entry) => (typeof entry === "string" ? { spoken: entry.trim() } : { spoken: entry.spoken.trim(), onScreen: entry.onScreen?.trim() || undefined }));

  const pieces = entries
    .filter((entry) => entry.spoken)
    .flatMap((entry) => splitLine(entry.spoken, wps).map((spoken, index) => ({ spoken, onScreen: index === 0 ? entry.onScreen : undefined })));
  if (!pieces.length) return null;

  let clock = 0;
  const beats: Beat[] = pieces.map((piece, index) => {
    const count = words(piece.spoken).length;
    const dur = count / wps;
    const beat: Beat = { n: index + 1, start: clock, dur, words: count, text: piece.spoken, onScreen: piece.onScreen, concrete: concreteCount(piece.spoken), label: "", flags: [] };
    clock += dur;
    return beat;
  });
  const total = clock;

  for (const beat of beats) if (beat.n === 1 || beat.start + beat.dur <= HOOK_WINDOW) beat.label = "HOOK";
  const last = beats[beats.length - 1];
  last.label = last.label === "HOOK" ? "HOOK/CTA" : "CTA";
  const half = total / 2;
  const mid = beats.find((beat) => !beat.label && beat.start <= half && half < beat.start + beat.dur);
  if (mid) mid.label = "MID";

  const notes: string[] = [];
  let blocking = 0;
  const first = beats[0];
  if (first.dur > HOOK_WINDOW) {
    first.flags.push(`el hook dura ${first.dur.toFixed(1)}s, pasa la marca de ${HOOK_WINDOW}s`);
    notes.push(`El beat 1 tarda ${first.dur.toFixed(1)}s. Recortalo a ${Math.trunc(HOOK_WINDOW * wps)} palabras o menos: si no, el hook llega cuando ya decidieron.`);
    blocking++;
  }
  if (first.concrete === 0) notes.push("El beat 1 no tiene número ni nombre. Los hooks sin nada verificable son los que se scrollean.");

  for (const beat of beats) {
    if (beat.dur > MAX_BEAT) beat.flags.push(`${beat.dur.toFixed(1)}s en un solo beat`);
    if (beat.onScreen && words(beat.onScreen).length > 6) beat.flags.push(`tarjeta de ${words(beat.onScreen).length} palabras (máximo 6)`);
  }
  const longBeats = beats.filter((beat) => beat.dur > MAX_BEAT).map((beat) => beat.n);
  if (longBeats.length) {
    notes.push(`Beat(s) ${longBeats.join(", ")} pasan los ${MAX_BEAT}s. Partí la línea o cambiá lo que se ve en pantalla: un plano quieto es donde se van.`);
    blocking++;
  }
  const longCards = beats.filter((beat) => beat.onScreen && words(beat.onScreen).length > 6).map((beat) => beat.n);
  if (longCards.length) {
    notes.push(`Tarjeta(s) en pantalla del beat ${longCards.join(", ")} con más de 6 palabras. Se leen a un brazo de distancia.`);
    blocking++;
  }

  let run = 0;
  let runStart: number | null = null;
  for (const beat of beats) {
    if (beat.concrete === 0) {
      run++;
      runStart ??= beat.n;
      if (run === ABSTRACT_RUN) notes.push(`Los beats ${runStart}-${beat.n} no tienen nada concreto. Poné un número, un nombre o un modelo en alguno.`);
    } else {
      run = 0;
      runStart = null;
    }
  }

  const firstWords = new Set(lowerWords(first.text).filter((word) => !STOPWORDS.has(word)));
  const loop = Array.from(new Set(lowerWords(last.text).filter((word) => !STOPWORDS.has(word) && firstWords.has(word)))).sort();
  if (loop.length) {
    notes.push(`Loop: el último beat repite "${loop.slice(0, 3).join(", ")}" del hook. La segunda vista es alcance gratis.`);
  } else {
    notes.push("Sin loop. El cierre no comparte ninguna palabra con el hook. Repetir una palabra del beat 1 es la segunda vista más barata.");
    blocking++;
  }

  if (target) {
    const delta = total - target;
    if (Math.abs(delta) <= target * 0.1) notes.push(`Duración en objetivo (${total.toFixed(1)}s contra ${target}s).`);
    else if (delta > 0) notes.push(`${delta.toFixed(1)}s por encima del objetivo. Recortá unas ${Math.trunc(delta * wps)} palabras.`);
    else notes.push(`${(-delta).toFixed(1)}s por debajo del objetivo. Sumá ${Math.trunc(-delta * wps)} palabras o grabalo corto: corto suele estar bien.`);
  }

  return {
    wpm,
    target,
    totalSeconds: Math.round(total * 100) / 100,
    totalWords: beats.reduce((sum, beat) => sum + beat.words, 0),
    beats: beats.map((beat) => ({ ...beat, start: Math.round(beat.start * 100) / 100, dur: Math.round(beat.dur * 100) / 100 })),
    notes,
    clean: blocking === 0,
  };
}

/** Lista de tarjetas en pantalla con timecode, lista para `visualCues`. */
export function onScreenCards(sheet: BeatSheet): string[] {
  return sheet.beats.filter((beat) => beat.onScreen).map((beat) => `${timecode(beat.start)} ${beat.onScreen}`);
}

export function renderBeatSheet(sheet: BeatSheet): string {
  return sheet.beats.map((beat) => `${timecode(beat.start)} (${beat.dur.toFixed(1)}s) ${beat.label ? `[${beat.label}] ` : ""}${beat.text}`).join("\n");
}
