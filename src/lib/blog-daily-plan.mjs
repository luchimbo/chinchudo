export const MAX_DAILY_TOPICS = 10;
const languages = new Set(["es", "en", "de"]);

/** Cada fila es un tema; sus idiomas son versiones del mismo artículo. */
export function dailyArticlePlan(value, fallback = "es") {
  if (!Array.isArray(value) || !value.length) return [[languages.has(fallback) ? fallback : "es"]];
  return value.slice(0, MAX_DAILY_TOPICS).map(row => {
    const valid = Array.isArray(row) ? [...new Set(row.filter(item => languages.has(item)))] : [];
    return valid.length ? valid : [languages.has(fallback) ? fallback : "es"];
  });
}

export function validateDailyArticlePlan(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DAILY_TOPICS || value.some(row => !Array.isArray(row) || !row.length || row.length > 3 || row.some(item => !languages.has(item)) || new Set(row).size !== row.length)) {
    throw new Error(`Elegí entre 1 y ${MAX_DAILY_TOPICS} temas diarios y al menos un idioma por tema.`);
  }
  return value;
}
