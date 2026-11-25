/** Idiomas que se pueden filtrar en el Asistente CM. "other" agrupa todo lo demás. */
export const OPPORTUNITY_LANGUAGES = [
  { code: "es", label: "Español" },
  { code: "en", label: "Inglés" },
  { code: "pt", label: "Portugués" },
  { code: "de", label: "Alemán" },
  { code: "other", label: "Otro" },
] as const;

export type OpportunityLanguage = (typeof OPPORTUNITY_LANGUAGES)[number]["code"];

const CODES = new Set<string>(OPPORTUNITY_LANGUAGES.map((language) => language.code));

/** Valor válido para guardar o filtrar; cualquier otra cosa queda vacía (sin detectar / sin filtro). */
export function opportunityLanguage(value: unknown): OpportunityLanguage | "" {
  return typeof value === "string" && CODES.has(value) ? value as OpportunityLanguage : "";
}

const WORDS: Record<Exclude<OpportunityLanguage, "other">, Set<string>> = {
  es: new Set("el la los las un una unos unas que qué cuál cual cómo como para por pero con sin este esta ese esa es son está están hay muy más mas mejor tengo quiero necesito puedo comprar precio gracias hola alguien sabe yo mi me te se lo le nos del al y o también cuando donde dónde porque teclado de en no si sí ya ni tu tus su sus tiene tienes viene sirve hace hacer funciona funque andas vale aún algo todo todos nada mucho poco bien mal así bueno hermano gracias vos tenes tenés podés podre podré mejores video".split(" ")),
  en: new Set("the a an and or but which what how why for with without this that these those is are was were be have has had do does did can could should would will i my me you your it its they we buy need want price thanks hello anyone know good best great from of to in on".split(" ")),
  pt: new Set("e o os as um uma uns umas que qual como para por mas com sem este esta esse essa isso é são está estão tem tenho quero preciso posso comprar preço obrigado obrigada olá alguém sabe eu meu minha você vocês não muito mais melhor também quando onde porque do da dos das no na nos nas ao".split(" ")),
  de: new Set("der die das ein eine einen einem und oder aber welches welche wie warum für mit ohne dieser dieses diese ist sind war habe hat haben kann können sollte würde ich mein meine du dein sie es wir kaufen brauche möchte preis danke hallo jemand weiß gut beste nicht auch wenn wo weil von zu im auf".split(" ")),
};

const MARKS: Record<Exclude<OpportunityLanguage, "other">, RegExp> = {
  es: /[¿¡ñ]|ción|ciones/g,
  en: /(?!)/g,
  pt: /[ãõçâêô]|ção|ções|\bnão\b|\bvocê/g,
  de: /[ßäöü]/g,
};

/**
 * Heurística local para el idioma de un comentario: palabras frecuentes y letras
 * propias de cada idioma. Devuelve "other" si no alcanza para decidir.
 */
export function detectOpportunityLanguage(text: string): OpportunityLanguage {
  const lower = text.toLowerCase();
  const tokens = lower.match(/\p{L}+/gu) ?? [];
  const scores = (Object.keys(WORDS) as Exclude<OpportunityLanguage, "other">[]).map((code) => ({
    code,
    score: tokens.filter((token) => WORDS[code].has(token)).length + (lower.match(MARKS[code])?.length ?? 0) * 2
      // Tildes agudas sueltas: suman poco y solo a español (portugués ya tiene marcas propias).
      + (code === "es" && /[áéíóú]/.test(lower) ? 1 : 0),
  })).sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score >= 2 && best.score > second.score) return best.code;
  if (best.score === 1 && second.score === 0) return best.code;
  return "other";
}
