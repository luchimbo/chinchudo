"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import History from "@tiptap/extension-history";
import Placeholder from "@tiptap/extension-placeholder";
import { docToMarkers, findEntry, markersToDoc, markersToPlain, type ArticleCatalog, type ArticleLinkAttrs } from "@/lib/article-markers";
import { ArticleLink, type OpenLinkPayload } from "./article-link-node";
import { LinkPicker } from "./link-picker";

type DialogState = { mode: "insert"; from: number; to: number; text: string } | ({ mode: "edit" } & OpenLinkPayload);

/**
 * Texto con párrafos y enlaces como etiquetas. Recibe y devuelve el formato
 * de marcadores del blog; se monta una vez (cambiar `key` para reiniciarlo).
 */
export function BodyEditor({
  value,
  onChange,
  catalog,
  placeholder,
  label,
  className = "",
}: {
  value: string;
  onChange: (markers: string) => void;
  catalog: ArticleCatalog;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [focused, setFocused] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      History,
      Placeholder.configure({ placeholder }),
      ArticleLink.configure({ catalog, onOpen: (payload) => setDialog({ mode: "edit", ...payload }) }),
    ],
    content: markersToDoc(value),
    editorProps: {
      attributes: { class: `article-body-editor outline-none ${className}`, "aria-label": label, role: "textbox", "aria-multiline": "true" },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          const { from, to } = view.state.selection;
          setDialog({ mode: "insert", from, to, text: view.state.doc.textBetween(from, to, " ") });
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(docToMarkers(current.getJSON())),
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });

  // El catálogo llega una sola vez desde el servidor, pero si cambia se refleja en las etiquetas.
  useEffect(() => {
    if (!editor) return;
    const extension = editor.extensionManager.extensions.find((item) => item.name === "articleLink");
    if (extension) extension.options.catalog = catalog;
  }, [editor, catalog]);

  function openInsert() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    setDialog({ mode: "insert", from, to, text: editor.state.doc.textBetween(from, to, " ") });
  }

  function apply(attrs: ArticleLinkAttrs) {
    if (!editor || !dialog) return;
    if (dialog.mode === "insert") {
      editor.chain().focus().insertContentAt({ from: dialog.from, to: dialog.to }, { type: "articleLink", attrs }).run();
    } else {
      editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(dialog.pos, undefined, attrs); return true; }).run();
    }
    setDialog(null);
  }

  function remove() {
    if (!editor || dialog?.mode !== "edit") return;
    const node = editor.state.doc.nodeAt(dialog.pos);
    const attrs = dialog.attrs;
    const text = attrs.label || findEntry(catalog, attrs.kind, attrs.ref)?.name || attrs.ref;
    editor.chain().focus().insertContentAt({ from: dialog.pos, to: dialog.pos + (node?.nodeSize ?? 1) }, { type: "text", text }).run();
    setDialog(null);
  }

  const toolButton = "rounded-md px-2 py-1 text-xs font-semibold text-slate hover:bg-ink/5 hover:text-ink disabled:opacity-30";

  return (
    <div className="group/editor relative">
      <div className={`mb-1 flex items-center gap-1 transition-opacity ${focused || dialog ? "opacity-100" : "opacity-0 group-hover/editor:opacity-100 focus-within:opacity-100"}`}>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openInsert} className={`${toolButton} text-moss`} title="Enlazar a un producto, categoría o guía (Ctrl+K)">
          + Enlace <span className="font-normal opacity-60">Ctrl+K</span>
        </button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()} className={toolButton} aria-label="Deshacer">↶</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()} className={toolButton} aria-label="Rehacer">↷</button>
      </div>
      <EditorContent editor={editor} />
      {!editor ? <div className={`whitespace-pre-line ${className}`}>{markersToPlain(value, catalog)}</div> : null}
      {dialog ? (
        <LinkPicker
          catalog={catalog}
          initial={dialog.mode === "edit" ? dialog.attrs : undefined}
          selectedText={dialog.mode === "insert" ? dialog.text : undefined}
          onApply={apply}
          onRemove={dialog.mode === "edit" ? remove : undefined}
          onClose={() => { setDialog(null); editor?.commands.focus(); }}
        />
      ) : null}
    </div>
  );
}
