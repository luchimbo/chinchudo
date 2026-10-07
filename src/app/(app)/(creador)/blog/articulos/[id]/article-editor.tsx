"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { articleChecks, changedBlocks, draftFromContent, mergeDraft, type ArticleDraft } from "@/lib/article-edit";
import { completeArticle } from "@/lib/article-completion.mjs";
import type { ArticleCatalog } from "@/lib/article-markers";
import { parseMarkers } from "@/lib/article-markers";
import { BodyEditor } from "./body-editor";
import { SeoPanel } from "./seo-panel";
import { ChangesDialog } from "./editor-dialogs";
import { PreviewDialog } from "@/components/article-preview";
import type { SaveArticleResult } from "./actions";
import { reviewArticle, type EditorialQuality, type EditorialSource } from "@/lib/blog-quality.mjs";
import { EvidenceEditor } from "./evidence-editor";

type Props = {
  articleId: string;
  initialDraft: ArticleDraft;
  updatedAt: string;
  catalog: ArticleCatalog;
  content: Record<string, any>;
  evidence: { sources: EditorialSource[]; products: Record<string, any>; categories: Record<string, any> };
  published: boolean;
  publicUrl: string;
  backHref: string;
  clusterName: string;
  status: { label: string; date: string; tone: string; note?: string };
  save: (input: { id: string; expectedUpdatedAt: string; draft: ArticleDraft }) => Promise<SaveArticleResult>;
};

/** Reemplaza el valor de un bloque identificado como en articleBlocks(). */
function withBlock(draft: ArticleDraft, id: string, value: string): ArticleDraft {
  const match = id.match(/^(section|faq)-(\d+)-(h2|body|q|a)$/);
  if (!match) return { ...draft, [id]: value };
  const index = Number(match[2]);
  if (match[1] === "section") return { ...draft, sections: draft.sections.map((item, i) => (i === index ? { ...item, [match[3]]: value } : item)) };
  return { ...draft, faqs: draft.faqs.map((item, i) => (i === index ? { ...item, [match[3]]: value } : item)) };
}

function blockValue(draft: ArticleDraft, id: string): string {
  const match = id.match(/^(section|faq)-(\d+)-(h2|body|q|a)$/);
  if (!match) return String(draft[id as keyof ArticleDraft] ?? "");
  const list = match[1] === "section" ? draft.sections : draft.faqs;
  return String((list[Number(match[2])] as Record<string, string>)[match[3]] ?? "");
}

/** Textarea sin bordes que crece con el texto: se edita "sobre" el artículo. */
function InlineText({ value, onChange, className, label, singleLine, placeholder }: { value: string; onChange: (value: string) => void; className: string; label: string; singleLine?: boolean; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(singleLine ? event.target.value.replace(/\n/g, " ") : event.target.value)}
      onKeyDown={(event) => { if (singleLine && event.key === "Enter") event.preventDefault(); }}
      className={`block w-full resize-none overflow-hidden rounded-md border-0 bg-transparent p-0 placeholder:text-slate/50 focus:outline-none focus:ring-0 ${className}`}
    />
  );
}

function Block({ modified, onReset, label, children }: { modified: boolean; onReset: () => void; label: string; children: ReactNode }) {
  return (
    <div className={`group relative -mx-3 rounded-lg border-l-[3px] px-3 py-1.5 transition-colors focus-within:bg-white/70 hover:bg-white/50 ${modified ? "border-amber-400 bg-amber-50/40" : "border-transparent"}`}>
      {modified ? (
        <button type="button" onClick={onReset} className="absolute -top-2.5 right-2 z-10 rounded-full border border-amber-300 bg-paper px-2 py-0.5 text-[10px] font-semibold text-amber-800 shadow-sm hover:bg-amber-50" title={`Volver al texto guardado de: ${label}`}>
          Deshacer cambios
        </button>
      ) : null}
      {children}
    </div>
  );
}

const storageKey = (id: string, updatedAt: string) => `article-draft:${id}:${updatedAt}`;

function readStored(key: string): ArticleDraft | null {
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as ArticleDraft) : null; } catch { return null; }
}

export function ArticleEditor({ articleId, initialDraft, updatedAt: initialUpdatedAt, catalog, content, evidence, published, publicUrl, backHref, clusterName, status, save }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialDraft);
  const [draft, setDraft] = useState(initialDraft);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [epoch, setEpoch] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [recoverable, setRecoverable] = useState<ArticleDraft | null>(null);
  const [dialog, setDialog] = useState<"changes" | "preview" | null>(null);
  const [serverQuality, setServerQuality] = useState<EditorialQuality | null>(content.editorial_quality || null);

  const changes = useMemo(() => changedBlocks(saved, draft), [saved, draft]);
  const changedIds = useMemo(() => new Set(changes.map((change) => change.after.id)), [changes]);
  const checks = useMemo(() => articleChecks(draft, saved, catalog), [draft, saved, catalog]);
  const blocking = checks.some((check) => check.level === "error");
  const dirty = changes.length > 0;
  const quality = useMemo(() => reviewArticle({ ...evidence, content: { ...mergeDraft(content, draft), source_refs: evidence.sources.filter((s) => draft.sourceIds?.includes(s.id)) } }), [content, draft, evidence]);
  const completion = useMemo(() => completeArticle({ content: { ...mergeDraft(content, draft), source_refs: evidence.sources.filter(s => draft.sourceIds?.includes(s.id)) }, catalog, sources: evidence.sources }), [content, draft, catalog, evidence]);

  // Borrador local: protege lo escrito si se cierra la pestaña o se corta la sesión.
  useEffect(() => {
    const stored = readStored(storageKey(articleId, updatedAt));
    if (stored && changedBlocks(saved, stored).length) setRecoverable(stored);
    // Solo al abrir o después de guardar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, updatedAt]);

  useEffect(() => {
    const key = storageKey(articleId, updatedAt);
    const timer = window.setTimeout(() => {
      try {
        if (dirty) window.localStorage.setItem(key, JSON.stringify(draft));
        else if (!recoverable) window.localStorage.removeItem(key);
      } catch { /* Sin almacenamiento local: el editor sigue funcionando. */ }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [articleId, updatedAt, draft, dirty, recoverable]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = useCallback((id: string, value: string) => { setDraft((current) => ({ ...withBlock(current, id, value), sourceIds: [...new Set([...(current.sourceIds || []), ...parseMarkers(value).filter((m) => m.kind === "s").map((m) => m.ref)])] })); setMessage(null); }, []);

  function resetBlock(id: string) {
    setDraft((current) => withBlock(current, id, blockValue(saved, id)));
    setVersions((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }

  function replaceAll(next: ArticleDraft) {
    setDraft(next);
    setEpoch((current) => current + 1);
  }

  async function submit(nextDraft = draft) {
    if (!changedBlocks(saved, nextDraft).length || articleChecks(nextDraft, saved, catalog).some(c => c.level === "error") || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await save({ id: articleId, expectedUpdatedAt: updatedAt, draft: nextDraft });
      if (!result.ok) { setMessage({ tone: "error", text: result.error }); return; }
      try { window.localStorage.removeItem(storageKey(articleId, updatedAt)); } catch { /* ignorado */ }
      replaceAll(result.draft);
      setSaved(result.draft);
      setUpdatedAt(result.updatedAt);
      setRecoverable(null);
      setServerQuality(result.quality);
      setMessage({ tone: "ok", text: !result.quality.publishable ? published ? "Revisión guardada con errores. Corregilos para desplegar." : "Guardado para revisar. La publicación está suspendida." : result.redeploy ? "Guardado. Actualización pendiente de despliegue." : "Cambios guardados." });
      router.refresh();
    } catch {
      setMessage({ tone: "error", text: "No se pudieron guardar los cambios. Revisá la conexión y probá de nuevo." });
    } finally {
      setSaving(false);
    }
  }

  const keyFor = (id: string) => `${id}:${epoch}:${versions[id] ?? 0}`;
  const block = (id: string, label: string, child: ReactNode) => <Block key={id} modified={changedIds.has(id)} onReset={() => resetBlock(id)} label={label}>{child}</Block>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={backHref} onClick={(event) => { if (dirty && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) event.preventDefault(); }} className="text-xs font-semibold text-moss underline underline-offset-2">← Volver al calendario</Link>
        {published && publicUrl ? <a href={publicUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-sky-700 underline underline-offset-2">Ver publicado ↗</a> : null}
      </div>

      {recoverable ? (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Hay cambios sin guardar de una sesión anterior.</span>
          <button type="button" onClick={() => { replaceAll(recoverable); setRecoverable(null); }} className="rounded-full bg-amber-900 px-3 py-1 text-xs font-semibold text-amber-50">Recuperar</button>
          <button type="button" onClick={() => { try { window.localStorage.removeItem(storageKey(articleId, updatedAt)); } catch { /* ignorado */ } setRecoverable(null); }} className="text-xs font-semibold underline">Descartarlos</button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-2xl border border-ink/10 bg-paper px-5 py-7 shadow-sm sm:px-10 sm:py-10">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-moss">{clusterName}</p>
          {block("h1", "Título", <InlineText label="Título del artículo" singleLine value={draft.h1} onChange={(value) => update("h1", value)} placeholder="Título del artículo" className="font-display text-3xl leading-tight text-ink sm:text-4xl" />)}
          <div className="mt-3">
            {block("lede", "Bajada", <InlineText label="Bajada" value={draft.lede} onChange={(value) => update("lede", value)} placeholder="Bajada: una o dos frases que presentan el tema" className="text-lg leading-relaxed text-slate" />)}
          </div>

          <div className="mt-7 rounded-xl border border-moss/20 bg-moss/[0.05] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-moss">Respuesta directa</p>
            {block("answer", "Respuesta directa", <BodyEditor key={keyFor("answer")} label="Respuesta directa" value={draft.answer} onChange={(value) => update("answer", value)} catalog={catalog} placeholder="La respuesta corta a la búsqueda" className="article-prose text-[15px] leading-relaxed text-ink" />)}
          </div>

          {draft.sections.map((section, index) => (
            <section key={index} className="mt-9">
              <button type="button" className="mb-2 text-xs text-slate underline" onClick={() => { setDraft((d) => ({ ...d, sections: d.sections.filter((_, i) => i !== index) })); setEpoch((e) => e + 1); }}>Quitar sección</button>
              {block(`section-${index}-h2`, `Sección ${index + 1} · subtítulo`, <InlineText label={`Subtítulo de la sección ${index + 1}`} singleLine value={section.h2} onChange={(value) => update(`section-${index}-h2`, value)} placeholder="Subtítulo" className="font-display text-2xl leading-snug text-ink" />)}
              <div className="mt-2">
                {block(`section-${index}-body`, `Sección ${index + 1} · texto`, <BodyEditor key={keyFor(`section-${index}-body`)} label={`Texto de la sección ${index + 1}`} value={section.body} onChange={(value) => update(`section-${index}-body`, value)} catalog={catalog} placeholder="Escribí el contenido de la sección" className="article-prose text-base leading-relaxed text-ink" />)}
              </div>
            </section>
          ))}
          {draft.sections.length < 8 ? <button type="button" className="mt-5 text-sm font-semibold text-moss underline" onClick={() => setDraft((d) => ({ ...d, sections: [...d.sections, { h2: "", body: "" }] }))}>Agregar sección</button> : null}

          <section className="mt-10 rounded-2xl bg-ink px-5 py-6 text-paper">
            {block("solutionTitle", "Cierre · título", <InlineText label="Título del cierre" singleLine value={draft.solutionTitle} onChange={(value) => update("solutionTitle", value)} placeholder="Título del cierre" className="font-display text-xl text-paper" />)}
            <div className="mt-2">
              {block("solutionBody", "Cierre · texto", <BodyEditor key={keyFor("solutionBody")} label="Texto del cierre" value={draft.solutionBody} onChange={(value) => update("solutionBody", value)} catalog={catalog} placeholder="Cómo ayuda la tienda" className="article-prose text-[15px] leading-relaxed text-paper/85 [&_button]:text-ink" />)}
            </div>
          </section>

          {draft.faqs.length ? (
            <section className="mt-10">
              <h2 className="font-display text-2xl text-ink">Preguntas frecuentes</h2>
              <div className="mt-4 divide-y divide-ink/10 rounded-xl border border-ink/10 bg-white/60">
                {draft.faqs.map((faq, index) => (
                  <div key={index} className="px-4 py-3">
                    <button type="button" className="mb-1 text-xs text-slate underline" onClick={() => setDraft((d) => ({ ...d, faqs: d.faqs.filter((_, i) => i !== index) }))}>Quitar pregunta</button>
                    {block(`faq-${index}-q`, `Pregunta ${index + 1}`, <InlineText label={`Pregunta ${index + 1}`} singleLine value={faq.q} onChange={(value) => update(`faq-${index}-q`, value)} placeholder="Pregunta" className="font-semibold text-ink" />)}
                    {block(`faq-${index}-a`, `Respuesta ${index + 1}`, <InlineText label={`Respuesta ${index + 1}`} value={faq.a} onChange={(value) => update(`faq-${index}-a`, value)} placeholder="Respuesta" className="text-sm leading-relaxed text-slate" />)}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {draft.faqs.length < 12 ? <button type="button" className="mt-4 text-sm font-semibold text-moss underline" onClick={() => setDraft((d) => ({ ...d, faqs: [...d.faqs, { q: "", a: "" }] }))}>Agregar pregunta frecuente</button> : null}
          <EvidenceEditor draft={draft} onChange={(next) => { setDraft(next); setMessage(null); }} sources={evidence.sources} catalog={catalog} />
        </article>

        <div className="space-y-4"><SeoPanel draft={draft} onField={update} changed={changedIds} url={publicUrl} checks={checks} status={status} />
          <section className="rounded-2xl border border-ink/10 bg-paper p-4"><h2 className="font-display text-base">Revisión editorial</h2><p className="mt-1 text-xs text-slate">Los enlaces y las citas se completan automáticamente al generar y guardar, usando el catálogo y las fuentes disponibles.</p>
            {completion.changes.length > 0 ? <button type="button" disabled={saving} onClick={() => { void submit(draftFromContent(completion.content)); }} className="mt-3 rounded-full bg-ink px-3 py-2 text-xs font-semibold text-paper disabled:opacity-40">{saving ? "Completando…" : "Completar y guardar"}</button> : null}
            {!dirty && serverQuality?.checks.some((c) => c.level === "error") ? <div className="mt-3 text-xs text-rose-700"><p className="font-semibold">Revisión al guardar: pendiente</p>{serverQuality.checks.filter((c) => c.level === "error").map((c) => <p key={c.id} className="mt-1">{c.group}: {c.message}</p>)}</div> : null}
            {(["SEO", "AEO", "GEO", "DEO"] as const).map((group) => <div key={group} className="mt-3"><h3 className="text-xs font-bold">{group}</h3><ul className="mt-1 space-y-2">{quality.checks.filter((c) => c.group === group).map((c) => <li key={c.id} className={`text-xs ${c.level === "error" ? "text-rose-700" : c.level === "warning" ? "text-amber-800" : "text-slate"}`}>{c.level === "ok" ? "✓" : c.level === "error" ? "✕" : "!"} {c.message}</li>)}</ul></div>)}
          </section></div>
      </div>

      <div className="sticky bottom-3 z-40 mt-6 rounded-xl border border-ink/10 bg-paper/95 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <span className={`text-xs font-semibold ${dirty ? "text-amber-800" : "text-slate"}`} role="status">
            {dirty ? `${changes.length} ${changes.length === 1 ? "cambio" : "cambios"} sin guardar` : "Sin cambios"}
          </span>
          {dirty ? <button type="button" onClick={() => setDialog("changes")} className="text-xs font-semibold text-ink underline underline-offset-2">Ver cambios</button> : null}
          {message ? <span className={`text-xs ${message.tone === "error" ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</span> : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {dirty ? <button type="button" onClick={() => { if (window.confirm("¿Descartar todos los cambios sin guardar?")) replaceAll(saved); }} className="rounded-full px-3 py-2 text-sm text-slate hover:text-ink">Descartar</button> : null}
            <button type="button" onClick={() => setDialog("preview")} className="rounded-full border border-ink/20 px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/5">Vista previa exacta</button>
            <button type="button" onClick={() => { void submit(); }} disabled={!dirty || blocking || saving} title={blocking ? "Corregí los puntos marcados con ✕" : undefined}
              className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper disabled:opacity-40">
              {saving ? "Guardando…" : published ? "Guardar revisión" : "Guardar"}
            </button>
          </div>
        </div>
      </div>

      {dialog === "changes" ? <ChangesDialog changes={changes} catalog={catalog} onClose={() => setDialog(null)} /> : null}
      {dialog === "preview" ? <PreviewDialog articleId={articleId} draft={draft} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
