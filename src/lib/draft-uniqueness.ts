function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function normalizeDraftText(text: string) {
  return normalizedWords(text).join(" ");
}

function wordBigrams(text: string) {
  const words = normalizedWords(text);
  if (words.length < 2) return new Set(words);
  return new Set(words.slice(0, -1).map((word, index) => `${word} ${words[index + 1]}`));
}

export function draftSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeDraftText(left);
  const normalizedRight = normalizeDraftText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const leftBigrams = wordBigrams(left);
  const rightBigrams = wordBigrams(right);
  const intersection = [...leftBigrams].filter((item) => rightBigrams.has(item)).length;
  const union = new Set([...leftBigrams, ...rightBigrams]).size;
  return union ? intersection / union : 0;
}

export function findSimilarDraft(candidate: string, existing: Iterable<string>, threshold = 0.78) {
  let closest: { text: string; similarity: number } | null = null;
  for (const text of existing) {
    const similarity = draftSimilarity(candidate, text);
    if (similarity >= threshold && (!closest || similarity > closest.similarity)) {
      closest = { text, similarity };
    }
  }
  return closest;
}
