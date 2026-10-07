// Marcadores del cuerpo de los artículos del blog: [[p:producto]],
// [[c:categoria|texto]] y [[g:slug|texto]]. Es el mismo formato que genera y
// renderiza landing-build/build_landings.py (ARTICLE_MARKER_RE); el editor
// visual los muestra como etiquetas y los vuelve a escribir sin alterarlos.

export type MarkerKind = "p" | "c" | "g" | "s";

export type ArticleLinkAttrs = { kind: MarkerKind; ref: string; label: string | null };

export type CatalogEntry = { ref: string; name: string; detail?: string; disabled?: boolean; aliases?: string[]; keyword?: string };

export type ArticleCatalog = {
  products: CatalogEntry[];
  categories: CatalogEntry[];
  guides: CatalogEntry[];
  sources?: CatalogEntry[];
};

type TextNode = { type: "text"; text: string };
type LinkNode = { type: "articleLink"; attrs: ArticleLinkAttrs };
type InlineNode = TextNode | LinkNode;
type ParagraphNode = { type: "paragraph"; content?: InlineNode[] };
export type ArticleDoc = { type: "doc"; content: ParagraphNode[] };

export const MARKER_KIND_LABEL: Record<MarkerKind, string> = { p: "Producto", c: "Categoría", g: "Guía", s: "Fuente" };

const markerPattern = () => /\[\[([pcgs]):([^\]|]+?)(?:\|([^\]]+))?\]\]/g;

/** Párrafos separados por línea en blanco, igual que el renderizador del blog. */
export function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Forma canónica del texto: párrafos recortados, saltos simples como espacio
 * (el blog los muestra así) y una línea en blanco entre párrafos.
 */
export function normalizeBody(text: string): string {
  return splitParagraphs(text).map((part) => part.replace(/\s*\n\s*/g, " ")).join("\n\n");
}

export function parseMarkers(text: string): ArticleLinkAttrs[] {
  return [...text.matchAll(markerPattern())].map((match) => ({
    kind: match[1] as MarkerKind,
    ref: match[2].trim(),
    label: match[3] ?? null,
  }));
}

function inlineNodes(paragraph: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let position = 0;
  for (const match of paragraph.matchAll(markerPattern())) {
    const start = match.index ?? 0;
    if (start > position) nodes.push({ type: "text", text: paragraph.slice(position, start) });
    nodes.push({ type: "articleLink", attrs: { kind: match[1] as MarkerKind, ref: match[2].trim(), label: match[3] ?? null } });
    position = start + match[0].length;
  }
  if (position < paragraph.length) nodes.push({ type: "text", text: paragraph.slice(position) });
  return nodes;
}

export function markersToDoc(text: string): ArticleDoc {
  const paragraphs = normalizeBody(text).split("\n\n").filter(Boolean);
  if (!paragraphs.length) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => {
      const content = inlineNodes(paragraph);
      return content.length ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

/** Etiquetas sin los caracteres que cerrarían el marcador antes de tiempo. */
export function cleanLabel(label: string): string {
  return label.replace(/[\[\]|]/g, "").replace(/\s+/g, " ").trim();
}

export function markerText({ kind, ref, label }: ArticleLinkAttrs): string {
  const text = label ? cleanLabel(label) : "";
  return text ? `[[${kind}:${ref}|${text}]]` : `[[${kind}:${ref}]]`;
}

export function docToMarkers(doc: { content?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; attrs?: Record<string, unknown> }> }> }): string {
  return (doc.content || [])
    .map((paragraph) =>
      (paragraph.content || [])
        .map((node) => {
          if (node.type === "text") return node.text || "";
          if (node.type === "articleLink" && node.attrs) return markerText(node.attrs as ArticleLinkAttrs);
          if (node.type === "hardBreak") return " ";
          return "";
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

/** Texto como lo lee una persona: cada marcador reemplazado por su etiqueta. */
export function markersToPlain(text: string, catalog?: ArticleCatalog): string {
  return text.replace(markerPattern(), (_, kind: MarkerKind, ref: string, label?: string) =>
    label || (catalog ? findEntry(catalog, kind, ref.trim())?.name : undefined) || ref.trim(),
  );
}

export function catalogList(catalog: ArticleCatalog, kind: MarkerKind): CatalogEntry[] {
  return kind === "p" ? catalog.products : kind === "c" ? catalog.categories : kind === "s" ? catalog.sources || [] : catalog.guides;
}

export function findEntry(catalog: ArticleCatalog, kind: MarkerKind, ref: string): CatalogEntry | undefined {
  return catalogList(catalog, kind).find((entry) => entry.ref === ref);
}

/** Referencias que no existen en el catálogo del cliente (claves `k:ref`). */
export function invalidMarkers(text: string, catalog: ArticleCatalog): string[] {
  const invalid = new Set<string>();
  for (const marker of parseMarkers(text)) {
    if (!findEntry(catalog, marker.kind, marker.ref)) invalid.add(`${marker.kind}:${marker.ref}`);
  }
  return [...invalid];
}
