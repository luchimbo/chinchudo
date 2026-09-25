export type OpportunitySourcePreview = {
  text: string;
  commentCount?: string;
  publishedAgo?: string;
};

/**
 * Separa los metadatos que algunos buscadores agregan al final del resumen,
 * por ejemplo: "… Más de 40 comentarios · hace 1 año".
 */
export function splitOpportunitySourcePreview(sourceText: string): OpportunitySourcePreview {
  const text = sourceText.trim();
  const match = text.match(
    /^(.*?)(?:\s*[·|]\s*|\s+)((?:más de\s+)?[\d.,]+\s+comentarios?)(?:\s*[·|]\s*|\s+)(hace\s+.+)$/i,
  );

  if (!match) return { text };

  return {
    text: match[1].trim(),
    commentCount: match[2].trim(),
    publishedAgo: match[3].trim(),
  };
}

const YOUTUBE_COMMENT_URL = /[?&]lc=|#comment-/;

// Formato de algunos resultados viejos: "<descripción> Published Mar 3, 2024 <título> - YouTube".
const TRAILING_YOUTUBE_TITLE = /^(.*?)\s*Published\s+[A-Za-z]+\s+\d{1,2},?\s*\d{4}\s*(.+?)\s*-\s*YouTube\s*$/i;

function collapse(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

const SPANISH_MARKS = /[áéíóúñ¿¡]/giu;
const SPANISH_WORDS = new Set([
  "de", "la", "el", "los", "las", "del", "que", "qué", "para", "con", "por", "una", "un", "y", "en", "es",
  "como", "cómo", "cuál", "cual", "mi", "tu", "su", "lo", "se", "al", "sin", "más", "mejor", "este", "esta",
]);
const ENGLISH_WORDS = new Set([
  "the", "and", "to", "of", "for", "with", "how", "is", "you", "your", "what", "why", "which", "should",
  "i", "my", "it", "this", "that", "in", "on", "are", "do", "does", "can", "from", "was", "be", "best",
]);
const TRUNCATED_TITLE = /(\.\.\.|…)$/;

/** Heurística simple para títulos: acentos/¿¡ y palabras frecuentes de cada idioma. */
export function looksSpanish(text: string): boolean {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const spanish = (text.match(SPANISH_MARKS)?.length ?? 0) * 2 + words.filter((word) => SPANISH_WORDS.has(word)).length;
  const english = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  return spanish > english;
}

// Texto del reproductor que a veces toma el buscador del navegador como título ("7:29 7:29 Reproduciendo").
const PLAYER_OVERLAY_TITLE = /^\d{1,2}(:\d{2}){1,2}\b/;

/** Título limpio, o vacío si está truncado o es texto del reproductor. */
export function usableTitle(title: string) {
  const clean = collapse(title).replace(/\s+-\s+YouTube$/i, "").trim();
  return TRUNCATED_TITLE.test(clean) || PLAYER_OVERLAY_TITLE.test(clean) ? "" : clean;
}

/**
 * Título a mostrar de un video: en español si existe una versión en español
 * (original, doblada o traducida por YouTube); si el video solo está en otro
 * idioma, el original. Las alternativas son los títulos que devolvieron los
 * buscadores; se descartan las truncadas ("…") y se prefieren las que
 * coinciden con el inicio del texto guardado.
 */
export function pickYouTubeDisplayTitle({
  original = "",
  alternatives = [],
  sourceText = "",
}: {
  original?: string;
  alternatives?: string[];
  sourceText?: string;
}): string {
  const base = usableTitle(original);
  if (base && looksSpanish(base)) return base;
  const text = collapse(sourceText).toLowerCase();
  const prefixes = (title: string) => Number(text.startsWith(title.toLowerCase()));
  const usable = alternatives.map(usableTitle).filter(Boolean).sort((a, b) => prefixes(b) - prefixes(a));
  return usable.find(looksSpanish) || base || usable[0] || "";
}

/**
 * Los buscadores guardan los videos de YouTube como "<título> <descripción>".
 * En la UI se muestra solo el título. Devuelve vacío si no es un video de
 * YouTube o si es un comentario (ahí se muestra el comentario, que es lo que
 * hay que responder).
 */
export function youtubeVideoTitle({
  channel = "",
  sourceText,
  sourceTitle = "",
  sourceUrl = "",
}: {
  channel?: string;
  sourceText: string;
  sourceTitle?: string | null;
  sourceUrl?: string;
}): string {
  if (!/youtube|youtu\.be/i.test(`${channel} ${sourceUrl}`) || YOUTUBE_COMMENT_URL.test(sourceUrl)) return "";
  const title = collapse(sourceTitle ?? "");
  if (title) return title;
  return collapse(sourceText).match(TRAILING_YOUTUBE_TITLE)?.[2]?.trim() ?? "";
}
