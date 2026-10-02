"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { findEntry, MARKER_KIND_LABEL, type ArticleCatalog, type ArticleLinkAttrs } from "@/lib/article-markers";

export type OpenLinkPayload = { pos: number; attrs: ArticleLinkAttrs };

type ArticleLinkOptions = {
  catalog: ArticleCatalog;
  onOpen: (payload: OpenLinkPayload) => void;
};

export const CHIP_STYLE: Record<"store" | "guide" | "invalid", string> = {
  store: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
  guide: "border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100",
  invalid: "border-rose-300 bg-rose-50 text-rose-800 line-through decoration-rose-400/60 hover:bg-rose-100",
};

function ArticleLinkChip({ node, extension, getPos, selected }: NodeViewProps) {
  const attrs = node.attrs as ArticleLinkAttrs;
  const { catalog, onOpen } = extension.options as ArticleLinkOptions;
  const entry = findEntry(catalog, attrs.kind, attrs.ref);
  const text = attrs.label || entry?.name || attrs.ref;
  const style = !entry ? CHIP_STYLE.invalid : attrs.kind === "g" ? CHIP_STYLE.guide : CHIP_STYLE.store;
  const title = entry
    ? `${MARKER_KIND_LABEL[attrs.kind]}: ${entry.name}${entry.detail ? ` · ${entry.detail}` : ""} — clic para editar`
    : `${MARKER_KIND_LABEL[attrs.kind]} "${attrs.ref}" no está en el catálogo: se verá como texto. Clic para corregir.`;
  return (
    <NodeViewWrapper as="span" className="inline">
      <button
        type="button"
        contentEditable={false}
        title={title}
        onClick={() => { const pos = getPos(); if (typeof pos === "number") onOpen({ pos, attrs }); }}
        className={`mx-px inline-flex items-baseline gap-1 rounded-md border px-1.5 py-px align-baseline text-[0.95em] font-medium leading-snug transition ${style} ${selected ? "ring-2 ring-moss/40" : ""}`}
      >
        <span aria-hidden className="text-[0.7em] font-bold uppercase opacity-60">{attrs.kind === "g" ? "guía" : attrs.kind === "p" ? "prod" : attrs.kind === "s" ? "fuente" : "cat"}</span>
        {text}
      </button>
    </NodeViewWrapper>
  );
}

/** Enlace del cuerpo ([[p:]], [[c:]], [[g:]]) como etiqueta atómica: no se rompe al tipear. */
export const ArticleLink = Node.create<ArticleLinkOptions>({
  name: "articleLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { catalog: { products: [], categories: [], guides: [] }, onOpen: () => {} };
  },

  addAttributes() {
    return {
      kind: { default: "p" },
      ref: { default: "" },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{
      tag: "span[data-article-link]",
      getAttrs: (element) => ({
        kind: (element as HTMLElement).dataset.kind,
        ref: (element as HTMLElement).dataset.ref,
        label: (element as HTMLElement).dataset.label || null,
      }),
    }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-article-link": "", "data-kind": node.attrs.kind, "data-ref": node.attrs.ref, "data-label": node.attrs.label ?? "" }), node.attrs.label || node.attrs.ref];
  },

  renderText({ node }) {
    return node.attrs.label || node.attrs.ref;
  },

  addNodeView() {
    return ReactNodeViewRenderer(ArticleLinkChip, { as: "span" });
  },
});
