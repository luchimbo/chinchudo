// Port de ig-human (humanize.py + detect.py) con léxico de "slop" en español.
// Limpia huellas tipográficas y frases de manual, y puntúa qué tan humano suena.
import { NUMBER_RE, clamp, mean, round1, scale, ure } from "./text";

type SlopEntry = { find: string; replace: string };

// Frases de relleno típicas de texto generado en español, más las prohibidas
// por AGENTS.md. `replace` vacío borra la frase.
export const SLOP_LEXICON: SlopEntry[] = [
  { find: "te recomiendo 100%", replace: "a mí me funcionó" },
  { find: "es el mejor del mercado", replace: "rinde muy bien" },
  { find: "el mejor del mercado", replace: "una opción muy rendidora" },
  { find: "no lo dudes", replace: "" },
  { find: "sin lugar a dudas", replace: "" },
  { find: "sin duda alguna", replace: "" },
  { find: "sin duda", replace: "" },
  { find: "cabe destacar que", replace: "" },
  { find: "cabe mencionar que", replace: "" },
  { find: "es importante destacar que", replace: "" },
  { find: "es importante mencionar que", replace: "" },
  { find: "vale la pena mencionar que", replace: "" },
  { find: "en definitiva", replace: "" },
  { find: "en conclusión", replace: "" },
  { find: "en resumen", replace: "" },
  { find: "al siguiente nivel", replace: "más lejos" },
  { find: "llevá tu música", replace: "hacé sonar tu música" },
  { find: "potenciá tu creatividad", replace: "grabá más ideas" },
  { find: "potenciá", replace: "mejorá" },
  { find: "potenciar", replace: "mejorar" },
  { find: "desbloqueá", replace: "usá" },
  { find: "sumergite en", replace: "metete en" },
  { find: "experiencia única", replace: "experiencia" },
  { find: "revolucionario", replace: "nuevo" },
  { find: "revolucionaria", replace: "nueva" },
  { find: "increíble", replace: "muy bueno" },
  { find: "increíbles", replace: "muy buenos" },
  { find: "impresionante", replace: "muy bueno" },
  { find: "espectacular", replace: "muy bueno" },
  { find: "de última generación", replace: "actual" },
  { find: "sin precedentes", replace: "" },
  { find: "a otro nivel", replace: "" },
  { find: "un antes y un después", replace: "un cambio" },
  { find: "game changer", replace: "un cambio" },
  { find: "imprescindible", replace: "muy útil" },
  { find: "ideal para todos", replace: "útil para muchos" },
  { find: "en el mundo actual", replace: "hoy" },
  { find: "en la era digital", replace: "hoy" },
  { find: "descubrí cómo", replace: "mirá cómo" },
  { find: "no te lo podés perder", replace: "" },
  { find: "sumate a la revolución", replace: "" },
  { find: "seguinos para más", replace: "" },
];

const STRUCTURES: { id: string; regex: RegExp; fix: string }[] = [
  { id: "no-solo", regex: ure("\\bno (?:es )?solo\\b[^.!?\\n]{2,80}\\bsino (?:tambi[ée]n|que)\\b", "giu"), fix: "Decí la única cosa que querés decir. Borrá la mitad de preparación." },
  { id: "no-se-trata", regex: ure("\\bno se trata de\\b[^.!?\\n]{2,60}[.,]\\s*se trata de\\b", "giu"), fix: "Arrancá por lo segundo. La inversión es la huella." },
  { id: "en-resumen", regex: ure("^\\s*(?:en resumen|en conclusi[óo]n|para resumir|en definitiva)\\b", "gimu"), fix: "Un video no necesita párrafo de conclusión." },
  { id: "no-scrollees", regex: ure("^\\s*(?:no scrollees|esper[áa],? no pases)\\b", "gimu"), fix: "Lo que frena a quien pasa de largo tiene que ser la afirmación misma." },
  { id: "en-este-video", regex: ure("\\b(?:en (?:este|el de hoy) (?:video|reel)|hoy (?:te|les) voy a mostrar)\\b", "giu"), fix: "Borralo y arrancá por el resultado." },
  { id: "follow-bait", regex: ure("\\b(?:seguinos para m[áa]s|etiquet[áa] a alguien|dale like si|compart[íi] si)\\b", "giu"), fix: "Pedí la única acción que este video se ganó." },
  { id: "pared-hashtags", regex: /(?:#[\p{L}\p{N}_]+[ \t]*){5,}/gu, fix: "Tres hashtags alcanzan, cinco es el tope." },
  { id: "emoji-cohete", regex: /[\u{1F680}\u{1F525}\u{1F4A1}✨\u{1F3AF}]/gu, fix: "Un emoji como mucho, y no uno de estos." },
];

const INVISIBLE_RE = /\p{Cf}/gu;
const URL_RE = /https?:\/\/\S+/g;
const SENT_RE = /[^.!?\n]+[.!?]*/g;
const WORD_RE = /[\p{L}']+/gu;
const COLLOQUIAL = ure("\\b(?:che|viste|posta|re|igual|onda|tipo|dale|ojo|ten[ée]s|mir[áa]|fijate|prob[áa]|sab[ée]s|quer[ée]s|pod[ée]s|est[áa]s|sos|ac[áa]|ah[íi]|pa)\\b", "giu");
const PRONOUNS = ure("\\b(?:yo|me|mi|mis|nosotros|nos|vos|te|tu|tus|ustedes|les)\\b", "giu");
const PROPER = /(?<![.!?¿¡]\s*)(?<!^)(?<![\p{L}\p{N}])\p{Lu}[\p{Ll}\p{Lu}]{2,}(?![\p{L}\p{N}])/gmu;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
}

const SLOP_PATTERNS = SLOP_LEXICON.map((entry) => ({ ...entry, regex: ure(`\\b${escapeRegExp(entry.find)}(?![\\p{L}\\p{N}])`, "giu") }));

function preserveCase(original: string, replacement: string) {
  if (!replacement) return "";
  return original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

export type HumanizeResult = { text: string; changes: number; replaced: string[]; structuralTells: string[] };

/** Limpia invisibles, tipografía de máquina y slop. Las estructuras solo se marcan. */
export function humanizeText(input: string): HumanizeResult {
  let changes = 0;
  const replaced: string[] = [];
  const urls: string[] = [];
  let text = input.replace(URL_RE, (url) => `\u0000${urls.push(url) - 1}\u0000`);

  const count = (pattern: RegExp, replacement: string) => {
    text = text.replace(pattern, () => {
      changes++;
      return replacement;
    });
  };
  count(/[​-‍⁠﻿­]/g, "");
  count(/\s*—\s*/g, ", ");
  count(/–/g, "-");
  count(/[“”«»]/g, "\"");
  count(/[‘’]/g, "'");
  count(/…/g, "...");
  count(/[   ]/g, " ");

  for (const entry of SLOP_PATTERNS) {
    text = text.replace(entry.regex, (match) => {
      changes++;
      replaced.push(entry.find);
      return preserveCase(match, entry.replace);
    });
  }
  text = text
    .replace(/ {2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/(^|[.!?]\s+)([,;]\s*)/g, "$1")
    .replace(/(^|[.!?¿¡]\s*)(\p{Ll})/gu, (_, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .trim();
  text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => urls[Number(index)]);

  const structuralTells = STRUCTURES.filter((structure) => new RegExp(structure.regex.source, structure.regex.flags).test(text)).map((structure) => `${structure.id}: ${structure.fix}`);
  return { text, changes, replaced: Array.from(new Set(replaced)), structuralTells };
}

export type HumanCheck = "BURSTINESS" | "SPECIFICITY" | "SLOP" | "FINGERPRINT" | "VOICE";
export type HumanScore = { checks: Record<HumanCheck, { score: number; detail: string }>; score: number; verdict: "PASS" | "REVIEW" | "FLAGGED" };

const CHECKS: HumanCheck[] = ["BURSTINESS", "SPECIFICITY", "SLOP", "FINGERPRINT", "VOICE"];

function stdev(values: number[]) {
  const avg = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - avg) ** 2)));
}

/** Panel de cinco chequeos de ig-human/detect.py. Más alto es más humano. */
export function scoreHumanness(text: string): HumanScore {
  const tokens = text.match(WORD_RE) ?? [];
  const sentences = (text.match(SENT_RE) ?? []).map((sentence) => sentence.trim()).filter((sentence) => sentence.split(/\s+/).length > 2);

  const lens = sentences.map((sentence) => sentence.split(/\s+/).length);
  const cv = lens.length >= 4 && mean(lens) ? stdev(lens) / mean(lens) : 0;
  const burstiness = lens.length < 4 ? { score: 50, detail: "muy corto para juzgar" } : { score: scale(cv, 0.7, 0.22), detail: `variación ${cv.toFixed(2)} en ${lens.length} oraciones (ideal 0.55+)` };

  const per100 = tokens.length ? 100 / tokens.length : 0;
  const concreteHits = (text.match(new RegExp(NUMBER_RE.source, "giu")) ?? []).length + new Set(text.match(PROPER) ?? []).size;
  const specificity = tokens.length < 25 ? { score: 50, detail: "muy corto para juzgar" } : { score: scale(concreteHits * per100, 6, 0.5), detail: `${concreteHits} marcadores concretos, ${(concreteHits * per100).toFixed(1)} cada 100 palabras (ideal 4+)` };

  const slopFound = SLOP_PATTERNS.filter((entry) => new RegExp(entry.regex.source, entry.regex.flags).test(text));
  const slopHits = SLOP_PATTERNS.reduce((sum, entry) => sum + (text.match(new RegExp(entry.regex.source, entry.regex.flags)) ?? []).length, 0);
  const slop = tokens.length ? { score: scale(slopHits * per100, 0, 4), detail: `${slopHits} frase(s) de manual${slopFound.length ? `: ${slopFound.slice(0, 4).map((entry) => entry.find).join(", ")}` : ""}` } : { score: 50, detail: "vacío" };

  const invisible = (text.match(INVISIBLE_RE) ?? []).length;
  const em = (text.match(/—/g) ?? []).length;
  const curly = (text.match(/[‘’“”]/g) ?? []).length;
  const ellipsis = (text.match(/…/g) ?? []).length;
  const per1k = ((invisible * 4 + em * 2 + curly + ellipsis) * 1000) / Math.max(text.length, 1);
  const fingerprint = { score: scale(per1k, 0, 12), detail: `${invisible} invisibles, ${em} rayas largas, ${curly} comillas curvas, ${ellipsis} elipsis` };

  let voice: { score: number; detail: string };
  if (tokens.length < 25) {
    voice = { score: 50, detail: "muy corto para juzgar" };
  } else {
    const colloquial = (text.match(COLLOQUIAL) ?? []).length * per100;
    const person = (text.match(PRONOUNS) ?? []).length * per100;
    const tells = STRUCTURES.reduce((sum, structure) => sum + (text.match(new RegExp(structure.regex.source, structure.regex.flags)) ?? []).length, 0);
    voice = {
      score: clamp(scale(colloquial, 3, 0) * 0.35 + scale(person, 8, 1) * 0.35 + clamp(100 - tells * 22) * 0.3),
      detail: `${colloquial.toFixed(1)} marcas coloquiales y ${person.toFixed(1)} pronombres cada 100 palabras, ${tells} huella(s) estructural(es)`,
    };
  }

  const checks = { BURSTINESS: burstiness, SPECIFICITY: specificity, SLOP: slop, FINGERPRINT: fingerprint, VOICE: voice };
  const scores = CHECKS.map((check) => checks[check].score);
  const min = Math.min(...scores);
  const overall = mean(scores) * 0.6 + min * 0.4;
  return {
    checks: Object.fromEntries(CHECKS.map((check) => [check, { score: round1(checks[check].score), detail: checks[check].detail }])) as HumanScore["checks"],
    score: round1(overall),
    verdict: overall >= 70 && min >= 55 ? "PASS" : overall >= 50 ? "REVIEW" : "FLAGGED",
  };
}

