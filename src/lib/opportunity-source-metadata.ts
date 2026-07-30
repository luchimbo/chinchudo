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
