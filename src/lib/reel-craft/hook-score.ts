// Port de ig-reel/hookscore.py con léxicos en español rioplatense.
// Mide cinco propiedades del primer renglón de un Reel. No predice vistas:
// detecta saludos, preámbulos, hooks sin nada concreto y hooks lentos.
import { EMOJI_RE, HASHTAG_RE, NUMBER_RE, PROPER_RE, clamp, lowerWords, mean, round1, ure, words } from "./text";

export type HookCheck = "LENGTH" | "SPECIFICITY" | "STAKES" | "FRONTLOAD" | "ADDRESS";
export type HookVerdict = "STRONG" | "OK" | "WEAK";

export type HookScore = {
  hook: string;
  checks: Record<HookCheck, { score: number; detail: string }>;
  weakest: HookCheck;
  flags: string[];
  score: number;
  verdict: HookVerdict;
};

const CHECKS: HookCheck[] = ["LENGTH", "SPECIFICITY", "STAKES", "FRONTLOAD", "ADDRESS"];

const SPOKEN_NUMBERS = new Set(["cero", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "quince", "veinte", "treinta", "cuarenta", "cincuenta", "cien", "ciento", "mil", "millón", "millon", "millones", "docena", "mitad", "doble", "triple"]);
const MONEY_WORDS = new Set(["pesos", "peso", "dólares", "dolares", "lucas", "luca", "palos", "guita", "plata", "cuotas", "cuota", "precio", "sueldo", "alquiler"]);

const STAKES = new Set([
  "no", "nunca", "nadie", "error", "errores", "mal", "perdí", "perdi", "perder", "pierdas", "perdés", "cuesta", "costó", "costo", "caro", "pagaste", "pagué", "pague", "gasté", "gaste", "tiré", "tire",
  "roto", "rompí", "falla", "falló", "fallar", "ruido", "vecino", "vecinos", "riesgo", "cuidado", "ojo", "secreto", "oculto", "verdad", "mentira", "trampa", "estafa", "peor", "odio", "arrepentí",
  "antes", "hasta", "sin", "pero", "aunque", "salvo", "solo", "sólo", "único", "unico", "ya", "todavía", "todavia", "problema", "evitá", "evita", "dejá", "deja", "frená", "basta", "deberías",
  "versus", "vs", "contra", "reemplazó", "reemplaza", "gratis", "ahorrás", "ahorré", "culpa", "queja", "quejan", "devuelve", "devolví", "latencia",
]);

// Aperturas que gastan el primer segundo en nada. Se comparan por palabra
// completa (el original usaba startsWith y "so" pegaba con "sometimes").
const WEAK_OPENERS = ["hola", "buenas", "bueno", "chicos", "gente", "che", "hoy", "bienvenidos", "bienvenidas", "básicamente", "basicamente", "sinceramente", "eh", "em", "o sea", "quería", "queria", "quiero", "les quiero", "les traigo", "una de", "alguna vez", "sabías", "sabias", "en este", "en el", "la cosa", "hay", "esto es", "es un", "es una", "cuando se", "como"];

const IMPERATIVES = new Set(["nunca", "evitá", "dejá", "frená", "robate", "guardate", "copiá", "copiate", "fijate", "ojo", "probá", "mirá", "hacé", "elegí", "usá", "comprá", "escuchá", "pará", "olvidate", "anotá", "conectá", "bajá", "subí", "cambiá", "no"]);

const SECOND_PERSON = ure("\\b(?:vos|te|tu|tus|ti|contigo|usted|ustedes|ten[ée]s|sos|est[áa]s|pod[ée]s|quer[ée]s|sab[ée]s|necesit[áa]s|toc[áa]s|grab[áa]s|viv[íi]s|practic[áa]s|us[áa]s|tuyo|tuya)\\b");
const FIRST_PERSON = ure("\\b(?:yo|me|mi|mis|nosotros|nosotras|nuestro|nuestra|nuestros|llevo|tengo|compr[ée]|us[ée]|grab[ée]|prob[ée])\\b");
const VOSEO_IMPERATIVE = /^[\p{L}]{2,}[áéí]$/u;
const NOT_IMPERATIVE = new Set(["más", "está", "ahí", "acá", "allá", "así", "también", "después", "jamás", "quizá", "aún"]);
const PROPER_WORD =/^\p{Lu}[\p{Ll}\p{Lu}]{2,}$/u;

const DEALBREAKERS: [RegExp, string][] = [
  [ure("^\\s*(?:no scrollees|no pases|esper[áa]|par[áa] de scrollear)"), "Arranca pidiendo atención (\"no pases de largo\"). Pedirla demuestra que no la ganaste."],
  [ure("\\b(?:en (?:este|el de hoy) (?:video|reel)|hoy (?:te|les) (?:voy a mostrar|traigo|muestro)|te voy a (?:mostrar|contar|enseñar) c[oó]mo)\\b"), "Preámbulo de video. Borralo y arrancá por el resultado."],
  [ure("^\\s*(?:hola|buenas|qu[ée] tal|bienvenid[oa]s|ey|hey)\\b"), "Saludo. Nadie entra al feed para que lo saluden."],
  [new RegExp(HASHTAG_RE.source, "u"), "Hashtag en el gancho. Los hashtags van al final de la descripción, si van."],
  [EMOJI_RE, "Emoji en el gancho. En texto grande de pantalla hay lugar para palabras o para un emoji, no para los dos."],
];

function tokenIsNumber(token: string): boolean {
  return /^\$?\d/.test(token);
}

function checkLength(text: string) {
  const n = words(text).length;
  const chars = text.trim().length;
  let score = n >= 5 && n <= 12 ? 100 : n < 5 ? clamp(100 - (5 - n) * 20) : clamp(100 - (n - 12) * 11);
  if (chars > 60) score -= 12;
  return { score: clamp(score), detail: `${n} palabras, ${chars} caracteres, ~${(n / 2.75).toFixed(1)}s hablado (ideal 5-12 palabras)` };
}

function checkSpecificity(text: string) {
  const nums = (text.match(new RegExp(NUMBER_RE.source, "giu")) ?? []).map((value) => value.trim()).filter(Boolean);
  const propers = new Set(text.match(PROPER_RE) ?? []);
  const spoken = lowerWords(text).filter((word) => SPOKEN_NUMBERS.has(word) || MONEY_WORDS.has(word));
  const hits = nums.length + propers.size + spoken.length;
  const found = [...nums.slice(0, 2), ...Array.from(propers).sort().slice(0, 2), ...spoken.slice(0, 2)].join(", ");
  return { score: hits === 0 ? 15 : clamp(45 + hits * 30), detail: hits ? `${hits} marcador(es) concreto(s): ${found}` : "0 marcadores: sin número, sin nombre, nada verificable" };
}

function checkStakes(text: string) {
  const markers = Array.from(new Set(lowerWords(text).filter((word) => STAKES.has(word)))).sort();
  if (/\$\s?\d/.test(text)) markers.push("un precio");
  const score = markers.length === 0 ? 20 : markers.length === 1 ? 70 : 100;
  return { score, detail: markers.length ? `${markers.length} marcador(es) de tensión: ${markers.slice(0, 4).join(", ")}` : "0 marcadores: no hay nada en juego en esta frase" };
}

function checkFrontload(text: string) {
  const original = words(text);
  if (!original.length) return { score: 0, detail: "vacío" };
  const low = lowerWords(text);
  const opener = low.slice(0, 2).join(" ");
  const weak = WEAK_OPENERS.find((candidate) => opener === candidate || opener.startsWith(`${candidate} `) || low[0] === candidate);
  const penalty = weak ? 30 : 0;
  const payload = low.findIndex((token, index) => STAKES.has(token) || SPOKEN_NUMBERS.has(token) || MONEY_WORDS.has(token) || tokenIsNumber(original[index]) || (index > 0 && PROPER_WORD.test(original[index])));
  let base: number;
  let where: string;
  if (payload < 0) [base, where] = [30, "ninguna palabra con carga en toda la frase"];
  else if (payload <= 3) [base, where] = [100, `carga en la palabra ${payload + 1}`];
  else if (payload <= 6) [base, where] = [70, `carga en la palabra ${payload + 1}, se puede adelantar`];
  else [base, where] = [40, `carga en la palabra ${payload + 1}, demasiado tarde`];
  return { score: clamp(base - penalty), detail: where + (weak ? `; apertura débil "${weak}"` : "") };
}

function checkAddress(text: string) {
  const low = lowerWords(text);
  if (SECOND_PERSON.test(text)) return { score: 100, detail: "le habla al espectador" };
  if (low[0] && (IMPERATIVES.has(low[0]) || (VOSEO_IMPERATIVE.test(low[0]) && !NOT_IMPERATIVE.has(low[0])))) return { score: 90, detail: `abre con imperativo ("${low[0]}")` };
  if (FIRST_PERSON.test(text)) return { score: 70, detail: "primera persona, sin espectador" };
  return { score: 35, detail: "tercera persona, no le habla a nadie" };
}

export function scoreHook(hook: string): HookScore {
  const checks = {
    LENGTH: checkLength(hook),
    SPECIFICITY: checkSpecificity(hook),
    STAKES: checkStakes(hook),
    FRONTLOAD: checkFrontload(hook),
    ADDRESS: checkAddress(hook),
  };
  const flags = DEALBREAKERS.filter(([pattern]) => pattern.test(hook)).map(([, message]) => message);
  const scores = CHECKS.map((check) => checks[check].score);
  const min = Math.min(...scores);
  const overall = clamp(mean(scores) * 0.6 + min * 0.4 - flags.length * 15);
  const verdict: HookVerdict = overall >= 70 && min >= 55 && !flags.length ? "STRONG" : overall >= 50 ? "OK" : "WEAK";
  const weakest = CHECKS.reduce((low, check) => (checks[check].score < checks[low].score ? check : low), CHECKS[0]);
  return {
    hook,
    checks: Object.fromEntries(CHECKS.map((check) => [check, { score: round1(checks[check].score), detail: checks[check].detail }])) as HookScore["checks"],
    weakest,
    flags,
    score: round1(overall),
    verdict,
  };
}

/** Ordena de mejor a peor. Si el primero queda por debajo de 50, ninguno es el hook. */
export function rankHooks(hooks: string[]): HookScore[] {
  return hooks.filter((hook) => hook.trim()).map(scoreHook).sort((a, b) => b.score - a.score);
}

export const HOOK_MIN_SCORE = 50;
