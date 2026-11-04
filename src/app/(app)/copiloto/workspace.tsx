"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { confirmYouTubeNotPublished, discardCopilotOpportunity, generateCopilotDrafts, markCopilotResponse, publishCopilotYouTubeResponse, regenerateCopilotResponse } from "@/app/(app)/opportunities/actions";
import { coverageNeedsDetail, type CoverageRow } from "@/lib/cm-coverage-view";
import { CMRuntime, CMJobStatus, useCMRuntime, enqueueCM } from "./runtime";
import { CoveragePanel } from "./coverage-panel";
import { useCatalogSearch } from "@/lib/use-catalog-search";
import { communityFromUrl, formatAuthor } from "@/lib/source-author";
import { youtubeVideoTitle } from "@/lib/opportunity-source-metadata";
import { copyToClipboard } from "./clipboard";
import { RefinementChat, type ChatMessage } from "./RefinementChat";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { LoadingSpinner } from "@/components/loading-ui";
import { COPILOT_MAX_CHARACTERS, COPILOT_TARGET_CHARACTERS } from "@/lib/copilot-limits";

type Response = { id: string; text: string; variantType: string; isPrimary: boolean; persona: string; acceptedAsCorrect: boolean; chatHistory: ChatMessage[]; fresh: boolean };
type Opportunity = { coverageRevision?: string; id: string; text: string; title: string; notes: string; author: string; sourceUrl: string; channel: string; brand: string; product: string; productId: string; createdAt: string; status: string; responses: Response[]; freshness: string; refreshError: string };
type Coverage = { missing: number; stale: number; fresh: number; review: number; error: number; total: number };
type ProductOption = { id: string; name: string; brand: string };
type ProductChoice = { id: string; name: string };
type CompletionKind = "youtube" | "manual" | "discarded";
type CompletedOpportunity = { id: string; kind: CompletionKind; position: number; visible: boolean; moveFocus: boolean };
type WorkspaceItem = { type: "opportunity"; opportunity: Opportunity; position: number } | { type: "completed"; completion: CompletedOpportunity };

const NO_PRODUCT_LABEL = "Sin producto específico";

function normalizeSearch(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Desplegable de productos: se puede recorrer con scroll (agrupado por marca) o
 * escribir para filtrar. No tiene `name`, así que nunca viaja en el formulario que lo contiene.
 */
function ProductCombobox({ products, current, selected, onSelect, disabled = false }: {
  products: ProductOption[];
  current: ProductChoice;
  selected: ProductChoice | null;
  onSelect: (choice: ProductChoice) => void;
  disabled?: boolean;
}) {
  const { client, optimized } = useCMRuntime();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const shown = selected ?? current;

  const searched = useCatalogSearch("cm-product", query, open && optimized, client);
  const availableProducts = optimized ? searched.items : products;
  const searchable = useMemo(() => [{ id: "", name: NO_PRODUCT_LABEL, brand: "" }, ...availableProducts]
    .map((option) => ({ ...option, search: normalizeSearch(`${option.name} ${option.brand}`) })), [availableProducts]);
  const options = useMemo(() => {
    const tokens = normalizeSearch(query).split(/\s+/).filter(Boolean);
    return searchable.filter((option) => tokens.every((token) => option.search.includes(token)));
  }, [searchable, query]);
  // Los productos ya llegan ordenados por marca: cada marca es un grupo con su título fijo al scrollear.
  const groups = useMemo(() => options.reduce<{ brand: string; items: { option: ProductOption; index: number }[] }[]>((acc, option, index) => {
    const last = acc[acc.length - 1];
    if (last && last.brand === option.brand) last.items.push({ option, index });
    else acc.push({ brand: option.brand, items: [{ option, index }] });
    return acc;
  }, []), [options]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function openList() {
    if (disabled) return;
    setQuery("");
    // Abre parado en el producto actual para poder recorrer desde ahí.
    setActiveIndex(Math.max(0, searchable.findIndex((option) => option.id === shown.id)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(option: ProductOption) {
    onSelect({ id: option.id, name: option.name });
    close();
  }

  return <div ref={rootRef} className="relative w-full">
    <input
      ref={inputRef}
      role="combobox"
      aria-label="Producto para la propuesta"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
      value={open ? query : shown.name}
      placeholder={open ? `Buscar producto… (actual: ${shown.name})` : ""}
      disabled={disabled}
      onClick={() => { if (!open) openList(); }}
      onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) openList();
          else setActiveIndex((index) => Math.min(index + 1, options.length - 1));
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((index) => Math.max(index - 1, 0));
        } else if (event.key === "Enter") {
          // Siempre frenamos el Enter: el desplegable vive dentro de formularios que publican.
          event.preventDefault();
          if (open && options[activeIndex]) choose(options[activeIndex]);
          else openList();
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        } else if (event.key === "Tab") {
          close();
        }
      }}
      className="w-full truncate rounded-lg border border-ink/15 bg-white py-2 pl-3 pr-9 text-sm text-ink outline-none transition placeholder:text-slate/50 focus:border-brass disabled:cursor-wait disabled:opacity-60"
    />
    <button type="button" tabIndex={-1} aria-label={open ? "Cerrar lista de productos" : "Ver todos los productos"} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (open) close(); else { openList(); inputRef.current?.focus(); } }} className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate/60 transition hover:text-ink disabled:opacity-40">
      <span aria-hidden="true" className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
    {open ? <ul ref={listRef} id={listId} role="listbox" aria-label="Productos" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-ink/15 bg-white py-1 shadow-panel">
      {searched.hasMore ? <li><button type="button" onClick={searched.loadMore} className="p-2 text-xs">Cargar más productos</button></li> : null}
      {options.length === 0 ? <li className="px-3 py-3 text-xs text-slate/60">No hay productos que coincidan con “{query}”.</li> : groups.map((group) => <li key={group.brand || "sin-marca"} role="group" aria-label={group.brand || undefined}>
        {group.brand ? <p aria-hidden="true" className="sticky top-0 border-y border-ink/5 bg-paper px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/70">{group.brand}</p> : null}
        {group.items.map(({ option, index }) => {
          const isShown = option.id === shown.id;
          return <div
            key={option.id || "sin-producto"}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={isShown}
            data-index={index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            className={`flex cursor-pointer scroll-mt-7 items-start gap-2 px-3 py-2 text-sm leading-5 ${index === activeIndex ? "bg-moss/10 text-ink" : "text-slate hover:bg-paper hover:text-ink"} ${isShown ? "font-bold" : ""} ${option.id ? "" : "italic"}`}
          >
            <span aria-hidden="true" className="w-3 shrink-0 text-moss">{isShown ? "✓" : ""}</span>
            <span>{option.name}</span>
          </div>;
        })}
      </li>)}
    </ul> : null}
  </div>;
}

function cleanPreview(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function getAiReason(notes: string): string | null {
  if (!notes) return null;
  const match = notes.match(/Raz[oó]n IA:\s*(.+?)(?:\s+Prioridad estrat[eé]gica:|$)/i);
  return match?.[1]?.trim() || null;
}

function ExpandableText({ text, limit = 240, className = "" }: { text: string; limit?: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;
  const shown = expanded || !isLong ? text : `${text.slice(0, limit).trimEnd()}…`;
  return <p className={className}>{shown}{isLong ? <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-1.5 font-bold text-moss hover:text-ink">{expanded ? "Ver menos" : "Ver más"}</button> : null}</p>;
}

function PendingSubmit({ children, pendingLabel, className }: { children: React.ReactNode; pendingLabel: string; className: string }) {
  return <PendingSubmitButton loadingText={pendingLabel} className={className}>{children}</PendingSubmitButton>;
}

// Vive dentro del formulario de publicación, así que es type="button" y llama a la acción directamente.
function RegenerateButton({ opportunityId, responseId, chatHistory }: { opportunityId: string; responseId: string; chatHistory: ChatMessage[] | undefined }) {
  const runtime = useCMRuntime();
  const queued = runtime.jobs.some(job => job.opportunityId === opportunityId && ["QUEUED", "RUNNING"].includes(job.status));
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    if (!window.confirm("¿Generar una nueva propuesta? Se conserva el trabajo anterior y la conversación del chat.")) return;
    setRegenerating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("opportunityId", opportunityId);
      formData.set("responseId", responseId);
      if (chatHistory) formData.set("chatHistory", JSON.stringify(chatHistory));
      if (runtime.queue) await enqueueCM(formData, runtime.client, "regenerate"); else { await regenerateCopilotResponse(formData); runtime.notify(opportunityId); }
    } catch {
      setError("No se pudo regenerar la respuesta. Probá de nuevo en un momento.");
    } finally {
      setRegenerating(false);
    }
  }

  return <>
    <button type="button" onClick={regenerate} disabled={regenerating || queued} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-bold text-ink transition hover:border-ink/40 disabled:cursor-wait disabled:opacity-60">{regenerating ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Regenerando…</span> : "↻ Regenerar con lo aprendido"}</button>
    {error ? <p className="w-full text-[11px] font-medium text-red-600">{error}</p> : null}
  </>;
}

// Elegir otro producto rehace la propuesta: el prompt cambia de ficha y la respuesta se apoya en sus características.
function ProposalProductPicker({ opportunityId, responseId, products, current }: {
  opportunityId: string;
  responseId: string;
  products: ProductOption[];
  current: ProductChoice;
}) {
  const runtime = useCMRuntime();
  const [choice, setChoice] = useState<ProductChoice | null>(null);
  const queued = runtime.jobs.some(job => job.opportunityId === opportunityId && ["QUEUED", "RUNNING"].includes(job.status));
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changesProduct = choice !== null && choice.id !== current.id;

  async function apply() {
    if (!choice || !changesProduct) return;
    if (!window.confirm(`¿Preparar una nueva propuesta con «${choice.name}»? Se conserva el trabajo anterior.`)) return;
    setApplying(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("opportunityId", opportunityId);
      formData.set("responseId", responseId);
      formData.set("productId", choice.id);
      if (runtime.queue) await enqueueCM(formData, runtime.client, "regenerate"); else { await regenerateCopilotResponse(formData); runtime.notify(opportunityId); }
    } catch {
      setError("No se pudo rehacer la propuesta con ese producto. Probá de nuevo en un momento.");
    } finally {
      setApplying(false);
    }
  }

  return <div className="mb-3">
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/70">Producto de la propuesta</p>
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[200px] flex-1"><ProductCombobox products={products} current={current} selected={choice} onSelect={setChoice} disabled={applying || queued} /></div>
      <button type="button" onClick={apply} disabled={!changesProduct || applying || queued} className="rounded-full bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40">{applying ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Rehaciendo…</span> : "Rehacer propuesta"}</button>
    </div>
    {error ? <p className="mt-1.5 text-[11px] font-medium text-red-600">{error}</p> : null}
  </div>;
}

function ResponseCard({ response, text, setText, chatHistory, opportunityId, sourceUrl, channel, clientSlug, youtube, productPicker, onCompleted }: { response: Response; text: string; setText: (text: string) => void; chatHistory: ChatMessage[] | undefined; opportunityId: string; sourceUrl: string; channel: string; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; productPicker: React.ReactNode; onCompleted: (kind: CompletionKind, moveFocus: boolean) => void }) {
  const router = useRouter();
  const runtime = useCMRuntime();
  const [copied, setCopied] = useState(false);
  const [openingSource, setOpeningSource] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verifiedNotPublished, setVerifiedNotPublished] = useState(false);
  const isYouTube = channel.toLowerCase() === "youtube";
  const youtubeConnectUrl = `/api/integrations/youtube/connect?client=${encodeURIComponent(clientSlug)}&account=${encodeURIComponent(youtube?.account ?? "youtube-principal")}`;

  async function submitResponse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || (isYouTube && !youtube?.connected)) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    // Al completar, el botón desaparece y el foco cae al body: sólo quien envió con teclado necesita que se lo devolvamos a la confirmación.
    const active = document.activeElement;
    const keyboardSubmit = active instanceof HTMLElement && form.contains(active) && active.matches(":focus-visible");
    setSubmitting(true);
    setSubmissionError("");
    setReconnectRequired(false);
    try {
      if (isYouTube) {
        const result = await publishCopilotYouTubeResponse(formData);
        if (!result.success) {
          setSubmissionError(result.message);
          setReconnectRequired(result.reconnectRequired);
          setVerificationRequired("verificationRequired" in result && !!result.verificationRequired);
          return;
        }
      } else {
        await markCopilotResponse(formData);
      }
      // Si mientras esperaba la persona pasó el foco a otra parte, no se lo robamos.
      const focusStayedHere = document.activeElement === document.body || form.contains(document.activeElement);
      onCompleted(isYouTube ? "youtube" : "manual", keyboardSubmit && focusStayedHere);
      if (!runtime.optimized) router.refresh();
    } catch {
      setSubmissionError(isYouTube
        ? "No se pudo completar la publicación. El comentario sigue acá; comprobá el estado antes de reintentar."
        : "No se pudo guardar la respuesta. Comprobá si aparece en Historial antes de reintentar.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copy() {
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function openForPublishing() {
    setOpeningSource(true);
    // Abrir la pestaña primero, sincrónicamente dentro del gesto del click,
    // para que Chrome no la bloquee como popup y la pestaña de Cafishia quede intacta.
    const target = window.open(sourceUrl, "_blank", "noopener,noreferrer");
    await copyToClipboard(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
    setOpeningSource(false);
    if (!target) setPopupBlocked(true);
  }

  return <div className={`rounded-xl border p-4 ${response.isPrimary ? "border-moss/45 bg-moss/[0.05]" : "border-ink/10 bg-white"}`}>
    <div className="mb-3 flex items-center justify-between gap-3"><span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-ink">Propuesta lista para editar</span><span className="text-[11px] font-medium text-slate/65">{response.persona}</span></div>
    {/* Fuera del formulario de publicación: elegir producto nunca puede disparar un envío. */}
    {productPicker}
    <form onSubmit={submitResponse}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="responseId" value={response.id} />
      <input type="hidden" name="wasEdited" value={text.trim() !== response.text.trim() ? "true" : "false"} />
      {chatHistory ? <input type="hidden" name="chatHistory" value={JSON.stringify(chatHistory)} /> : null}
      {isYouTube ? <input type="hidden" name="account" value={youtube?.account ?? "youtube-principal"} /> : null}
      <textarea name="editedText" value={text} onChange={(event) => setText(event.target.value)} maxLength={COPILOT_MAX_CHARACTERS} rows={4} className="w-full resize-y rounded-lg border border-ink/10 bg-paper/65 px-3 py-2.5 text-sm leading-6 text-ink outline-none transition focus:border-brass" />
      <p className={`mt-1 text-right text-[11px] ${text.length > COPILOT_TARGET_CHARACTERS ? "text-brass" : "text-slate/60"}`}>{text.length}/{COPILOT_MAX_CHARACTERS}{text.length > COPILOT_TARGET_CHARACTERS ? ` · ideal hasta ${COPILOT_TARGET_CHARACTERS}` : ""}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-bold text-ink transition hover:border-ink/40">{copied ? "Copiado" : "Copiar"}</button>
        {isYouTube ? (
          youtube?.connected ? <button type="submit" disabled={submitting || verificationRequired} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:cursor-wait disabled:opacity-60">{submitting ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Publicando en YouTube…</span> : "Publicar en YouTube"}</button> : <a href={youtubeConnectUrl} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85">Conectar cuenta de YouTube</a>
        ) : <>
          <button type="submit" disabled={submitting} className="rounded-full bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-slate disabled:cursor-wait disabled:opacity-60">{submitting ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Guardando…</span> : "Guardar como respondida"}</button>
          <button type="button" onClick={openForPublishing} disabled={openingSource} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:cursor-wait disabled:opacity-60">{openingSource ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Abriendo…</span> : "Abrir para publicar"}</button>
        </>}
        <RegenerateButton opportunityId={opportunityId} responseId={response.id} chatHistory={chatHistory} />
      </div>
      {isYouTube ? <p className="mt-2 text-[11px] font-medium text-slate/65">{youtube?.connected ? `Se publicará con la cuenta conectada${youtube.channelTitle ? `: ${youtube.channelTitle}` : ""}.` : "Conectá una cuenta para publicar sin abrir YouTube."}</p> : null}
      {submissionError ? <div role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{submissionError}{reconnectRequired ? <a href={youtubeConnectUrl} className="ml-1 font-bold underline underline-offset-2">Reconectar cuenta de YouTube</a> : null}</div> : null}
      {verificationRequired ? <div className="mt-3 space-y-3 rounded-lg border border-brass/30 bg-paper p-3 text-xs">
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline">Revisar el comentario en YouTube</a>
        <label className="flex items-start gap-2"><input type="checkbox" checked={verifiedNotPublished} onChange={event => setVerifiedNotPublished(event.target.checked)} />Revisé YouTube y confirmé que el comentario no se publicó.</label>
        <button type="button" disabled={!verifiedNotPublished || submitting} className="rounded-full border border-ink/20 px-3 py-2 font-bold disabled:opacity-50" onClick={async () => {
          setSubmitting(true);
          try { const data = new FormData(); data.set("opportunityId", opportunityId); data.set("verifiedNotPublished", "true"); const result = await confirmYouTubeNotPublished(data); if (!result.success) { setSubmissionError(result.message); return; } setVerificationRequired(false); setVerifiedNotPublished(false); setSubmissionError("Podés volver a intentar la publicación."); }
          catch { setSubmissionError("No se pudo guardar la comprobación. El envío sigue bloqueado."); }
          finally { setSubmitting(false); }
        }}>Habilitar otro intento</button>
        <button type="button" disabled={submitting} className="block font-bold underline disabled:opacity-50" onClick={async event => {
          setSubmitting(true);
          try { const data = new FormData(event.currentTarget.form!); await markCopilotResponse(data); onCompleted("manual", false); }
          catch { setSubmissionError("No se pudo guardar como respondida. El envío sigue bloqueado."); }
          finally { setSubmitting(false); }
        }}>Ya se publicó: guardar como respondida</button>
      </div> : null}
      {!isYouTube && popupBlocked ? <p className="mt-2 text-[11px] font-medium text-red-600">El navegador bloqueó la pestaña nueva. El texto ya está copiado: permití popups para esta web y volvé a tocarlo, o pegá el comentario en una pestaña que abras vos.</p> : null}
    </form>
  </div>;
}

function ResponseWithChat({ response, opportunityId, sourceUrl, channel, clientSlug, youtube, productPicker, onCompleted, onDirtyChange }: { response: Response; opportunityId: string; sourceUrl: string; channel: string; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; productPicker: React.ReactNode; onCompleted: (kind: CompletionKind, moveFocus: boolean) => void; onDirtyChange?: (dirty: boolean) => void }) {
  // El texto vive acá para que el chat pueda reemplazar la versión editable.
  const runtime = useCMRuntime();
  const [chatOpen, setChatOpen] = useState(!runtime.optimized);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [variants, setVariants] = useState<Response[]>([]);
  async function openChat() {
    setChatLoading(true); setChatError("");
    try { const result = await fetch(`/api/cm/opportunities/${opportunityId}?client=${encodeURIComponent(clientSlug)}&history=1`);
      if (!result.ok) throw new Error(); const data = await result.json();
      setVariants(data.opportunity.responses.filter((r: Response) => r.id !== response.id));
      setChatHistory(data.opportunity.responses.find((r: Response) => r.id === response.id)?.chatHistory || []); setChatOpen(true);
    } catch { setChatError("No se pudo cargar la conversación. Reintentá."); } finally { setChatLoading(false); }
  }
  const [text, setText] = useState(response.text);
  useEffect(() => { onDirtyChange?.(text !== response.text); }, [text, response.text, onDirtyChange]);
  const [chatHistory, setChatHistory] = useState(response.chatHistory);
  return <div className="grid gap-4 lg:grid-cols-2">
    <ResponseCard response={response} text={text} setText={setText} chatHistory={chatOpen ? chatHistory : undefined} opportunityId={opportunityId} sourceUrl={sourceUrl} channel={channel} clientSlug={clientSlug} youtube={youtube} productPicker={productPicker} onCompleted={onCompleted} />
    {chatOpen ? <div><RefinementChat responseId={response.id} clientSlug={clientSlug} currentText={text} initialHistory={chatHistory} acceptedAsCorrect={response.acceptedAsCorrect} onApplyResponse={setText} onHistoryChange={setChatHistory} />{variants.length ? <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Otras propuestas ({variants.length})</summary>{variants.map(variant => <article key={variant.id} className="mt-3 rounded-lg border border-ink/10 p-3"><p className="whitespace-pre-wrap text-sm">{variant.text}</p><button type="button" onClick={() => setText(variant.text)} className="mt-2 text-xs font-bold text-moss">Usar este texto como edición</button></article>)}</details> : null}</div> : <div><button type="button" disabled={chatLoading} onClick={openChat} className="rounded-lg border border-ink/15 p-3 text-sm">{chatLoading ? "Cargando conversación…" : "Abrir conversación y variantes"}</button>{chatError ? <p role="alert">{chatError}</p> : null}</div>}
  </div>;
}

function AuthorLine({ author, channel, sourceUrl }: { author: string; channel: string; sourceUrl: string }) {
  const display = useMemo(() => formatAuthor(author, channel, sourceUrl), [author, channel, sourceUrl]);
  if (!display) {
    const community = communityFromUrl(sourceUrl);
    return <p className="mt-4 text-xs font-medium text-slate/55">Autor no identificado{community ? ` · ${community}` : ""}</p>;
  }
  const name = <span className="truncate text-sm font-bold text-ink">{display.name}</span>;
  return <div className="mt-4 flex min-w-0 items-center gap-2.5">
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">{display.initial}</span>
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      {display.profileUrl ? <a href={display.profileUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:underline">{name}</a> : name}
      {display.handle ? <span className="truncate text-xs text-slate/65">{display.handle}</span> : null}
    </div>
  </div>;
}

function CompletedOpportunityCard({ completion, clientSlug, onDismiss }: { completion: CompletedOpportunity; clientSlug: string; onDismiss: (id: string) => void }) {
  const remainingMs = useRef(8_000);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hovered = useRef(false);
  const focused = useRef(false);
  const cardRef = useRef<HTMLElement>(null);
  const titleId = useId();

  const pauseTimer = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAt.current));
  }, []);

  useEffect(() => {
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(completion.id), remainingMs.current);
    if (completion.moveFocus) {
      // Quien envió con teclado perdió el botón que tenía el foco: lo llevamos a la confirmación (pausa el temporizador mientras lo tenga).
      cardRef.current?.focus();
      if (focused.current) pauseTimer();
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [completion.id, completion.moveFocus, onDismiss, pauseTimer]);

  function resumeTimer() {
    if (hovered.current || focused.current || timer.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(completion.id), remainingMs.current);
  }

  return <article
    ref={cardRef}
    tabIndex={-1}
    role="status"
    aria-live="polite"
    aria-labelledby={titleId}
    onMouseEnter={() => { hovered.current = true; pauseTimer(); }}
    onMouseLeave={() => { hovered.current = false; resumeTimer(); }}
    onFocusCapture={() => { focused.current = true; pauseTimer(); }}
    onBlurCapture={(event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      focused.current = false;
      resumeTimer();
    }}
    className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-moss/35 bg-moss/[0.08] px-5 py-5 shadow-panel focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/60 focus-visible:ring-offset-2"
  >
    <div>
      <p id={titleId} className="text-base font-bold text-moss">✓{completion.kind === "youtube" ? "Comentario publicado en YouTube" : completion.kind === "discarded" ? "Oportunidad descartada" : "Respuesta registrada"}</p>
      <p className="mt-1 text-sm text-ink/75">La oportunidad salió de la bandeja y quedó en Historial.</p>
      <Link href={clientSlug ? `/historial?client=${encodeURIComponent(clientSlug)}` : "/historial"} className="mt-3 inline-block text-sm font-bold text-moss underline underline-offset-4 hover:text-ink">Ver en Historial →</Link>
    </div>
    <button type="button" onClick={() => onDismiss(completion.id)} className="rounded-full border border-moss/30 px-3 py-1.5 text-xs font-bold text-moss transition hover:bg-moss/10">Cerrar</button>
  </article>;
}

function OpportunityCard({ opportunity: initialOpportunity, clientSlug, youtube, products, onCompleted }: { opportunity: Opportunity; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; products: ProductOption[]; onCompleted: (kind: CompletionKind, moveFocus: boolean) => void }) {
  const runtime = useCMRuntime();
  const dirty = useRef(false);
  const [updatePending, setUpdatePending] = useState(false);
  const [pendingResponses, setPendingResponses] = useState<Response[]>([]);
  const [copiedProposal, setCopiedProposal] = useState("");
  const onDirtyChange = useCallback((value: boolean) => { dirty.current = value; }, []);
  const [opportunity, setOpportunity] = useState(initialOpportunity);
  useEffect(() => { setOpportunity(initialOpportunity); }, [initialOpportunity]);
  const currentOpportunity = useRef(opportunity);
  currentOpportunity.current = opportunity;
  useEffect(() => {
    if (!runtime.optimized && !runtime.queue) return;
    let controller: AbortController | undefined;
    let running = false, stopped = false, lastDetailRevision = "";
    const refresh = () => {
      if (running || stopped) return;
      running = true; controller = new AbortController();
      void fetch(`/api/cm/opportunities/${initialOpportunity.id}?client=${encodeURIComponent(clientSlug)}${runtime.optimized ? "" : "&history=1"}`, { signal: controller.signal })
        .then(async r => {
          if (!r.ok) throw new Error("detail_failed");
          const next = (await r.json()).opportunity;
          if (stopped) return;
          if (dirty.current) { setPendingResponses(next.responses); setUpdatePending(true); } else { setOpportunity(next); setUpdatePending(false); setPendingResponses([]); }
        }).catch(() => { lastDetailRevision = ""; }).finally(() => { running = false; });
    };
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === initialOpportunity.id) refresh(); };
    const covered = (event: Event) => {
      const detail = (event as CustomEvent<{ client: string; rows: CoverageRow[] }>).detail;
      if (detail.client !== clientSlug) return;
      const row = detail.rows?.find(row => row.id === initialOpportunity.id);
      if (!row) return;
      if (coverageNeedsDetail(currentOpportunity.current, row)) {
        if (!running && (!row.revision || lastDetailRevision !== row.revision)) { lastDetailRevision = row.revision || ""; refresh(); }
      } else {
        setOpportunity(current => current.freshness === row.status && current.refreshError === row.error && current.coverageRevision === row.revision ? current :
          { ...current, freshness: row.status, refreshError: row.error, coverageRevision: row.revision });
      }
    };
    window.addEventListener("cm-opportunity-changed", changed);
    window.addEventListener("cm-coverage-updated", covered);
    return () => { stopped = true; controller?.abort(); window.removeEventListener("cm-opportunity-changed", changed); window.removeEventListener("cm-coverage-updated", covered); };
  }, [clientSlug, initialOpportunity.id, runtime.optimized, runtime.queue]);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [generateChoice, setGenerateChoice] = useState<ProductChoice | null>(null);
  const currentProduct = { id: opportunity.productId, name: opportunity.product || NO_PRODUCT_LABEL };
  const date = new Date(opportunity.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const responses = useMemo(() => [...opportunity.responses].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)), [opportunity.responses]);
  const response = responses[0];
  const updatedProposal = opportunity.freshness === "review" ? responses.find((item) => item.fresh && item.id !== response?.id) : undefined;
  // En videos de YouTube se muestra solo el título, no la descripción.
  const videoTitle = useMemo(
    () => youtubeVideoTitle({ channel: opportunity.channel, sourceText: opportunity.text, sourceTitle: opportunity.title, sourceUrl: opportunity.sourceUrl }),
    [opportunity.channel, opportunity.text, opportunity.title, opportunity.sourceUrl],
  );
  const aiReason = useMemo(() => getAiReason(opportunity.notes), [opportunity.notes]);
  const [reasonOpen, setReasonOpen] = useState(false);

  // Sin overflow-hidden: el desplegable de productos tiene que poder salir de la tarjeta.
  return <article id={`op-${opportunity.id}`} className="scroll-mt-6 break-words rounded-2xl border border-ink/10 bg-white/85 shadow-panel">
    <div className="border-b border-ink/10 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate/70"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink/7 px-2.5 py-1 text-ink">{opportunity.channel}</span>{opportunity.product ? <span className="text-slate/50">{opportunity.product}</span> : null}</div><span>{date}</span></div><AuthorLine author={opportunity.author} channel={opportunity.channel} sourceUrl={opportunity.sourceUrl} /><div className="mt-3 max-w-3xl">{videoTitle ? <p className="font-display text-lg font-bold leading-6 text-ink">{videoTitle}</p> : <ExpandableText text={cleanPreview(opportunity.text)} limit={240} className="whitespace-pre-wrap text-[15px] leading-7 text-slate/80" />}</div><div className="mt-4 flex flex-wrap items-center gap-2"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink/40">Abrir fuente</a>{aiReason ? <button type="button" onClick={() => setReasonOpen((value) => !value)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-slate/65 underline decoration-slate/25 underline-offset-4 hover:text-ink">Razón IA<span aria-hidden="true" className={`transition-transform ${reasonOpen ? "rotate-180" : ""}`}>▾</span></button> : null}</div>{aiReason && reasonOpen ? <div className="mt-3 max-w-3xl rounded-md bg-paper p-3 text-sm leading-6 text-slate">{aiReason}</div> : null}</div>
    <div className="px-5 py-5">
      <CMJobStatus opportunityId={opportunity.id} />
      {updatePending ? <p role="status" className="mb-3 text-xs text-moss">La oportunidad cambió. Tu edición se conserva. Podés revisar las propuestas guardadas abajo.</p> : null}
      <p className={`mb-3 text-xs font-semibold ${opportunity.freshness === "fresh" ? "text-moss" : "text-slate"}`}>
        {opportunity.freshness === "fresh" ? "Respuesta actualizada" : opportunity.freshness === "review" ? "Hay una propuesta actualizada para revisar. Tu respuesta anterior se conserva." : opportunity.freshness === "error" ? "No se pudo actualizar. Se volverá a intentar; podés regenerar manualmente." : opportunity.freshness === "stale" ? "Pendiente de actualización con las reglas actuales" : "Pendiente de generación automática"}
      </p>
      {opportunity.refreshError ? <details className="mb-3 text-xs text-slate"><summary className="cursor-pointer">Ver motivo</summary><p className="mt-2">{opportunity.refreshError}</p></details> : null}
      {!response ? <form action={async data => { if (runtime.queue) await enqueueCM(data, clientSlug, "generate"); else { await generateCopilotDrafts(data); runtime.notify(opportunity.id); } }} className="rounded-xl bg-paper p-4">
        <input type="hidden" name="opportunityId" value={opportunity.id} />
        {(runtime.optimized || products.length > 0) ? <div className="mb-3 max-w-md"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/70">Producto para la propuesta</p><ProductCombobox products={products} current={currentProduct} selected={generateChoice} onSelect={setGenerateChoice} /></div> : null}
        {generateChoice ? <input type="hidden" name="productId" value={generateChoice.id} /> : null}
        <PendingSubmit pendingLabel="Generando respuesta..." className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-slate">Generar respuesta</PendingSubmit>
        <p className="mt-2 text-xs text-slate/70">{generateChoice ? `Se genera con ${generateChoice.id ? `las características de ${generateChoice.name}` : "ningún producto específico"}, además de lo que la IA aprendió de los chats.` : "Se genera con las reglas y respuestas correctas que la IA aprendió de los chats. Después la podés ajustar acá mismo."}</p>
      </form> : <ResponseWithChat onDirtyChange={onDirtyChange} key={`${response.id}:${response.text}`} response={response} opportunityId={opportunity.id} sourceUrl={opportunity.sourceUrl} channel={opportunity.channel} clientSlug={clientSlug} youtube={youtube} productPicker={(runtime.optimized || products.length > 0) ? <ProposalProductPicker opportunityId={opportunity.id} responseId={response.id} products={products} current={currentProduct} /> : null} onCompleted={onCompleted} />}
      {updatePending ? <details className="mt-4 rounded-lg border border-moss/20 bg-paper p-3"><summary className="cursor-pointer text-sm font-semibold text-moss">Ver propuestas guardadas</summary>
        {pendingResponses.length ? pendingResponses.map(saved => <section key={saved.id} className="mt-3 rounded-lg border border-ink/10 bg-white p-3"><p className="whitespace-pre-wrap text-sm text-ink">{saved.text}</p><button type="button" className="mt-2 text-xs font-semibold text-moss" onClick={async () => { await copyToClipboard(saved.text); setCopiedProposal(saved.id); }}>{copiedProposal === saved.id ? "Copiado" : "Copiar texto"}</button></section>) : <p className="mt-2 text-xs text-slate">Ya no hay propuestas guardadas para esta oportunidad.</p>}
      </details> : null}
      {updatedProposal ? <div className="mt-6 rounded-xl border border-moss/25 bg-moss/[0.04] p-4"><h3 className="mb-3 text-sm font-bold text-moss">Propuesta actualizada para revisar</h3><ResponseWithChat key={updatedProposal.id} response={updatedProposal} opportunityId={opportunity.id} sourceUrl={opportunity.sourceUrl} channel={opportunity.channel} clientSlug={clientSlug} youtube={youtube} productPicker={null} onCompleted={onCompleted} /></div> : null}
      <div className="mt-4">{discardOpen ? <form action={async data => { await discardCopilotOpportunity(data); onCompleted("discarded", false); }} className="flex flex-wrap items-center gap-2 rounded-xl border border-signal/20 bg-signal/[0.04] p-3"><input type="hidden" name="opportunityId" value={opportunity.id} /><select name="reason" defaultValue="NO_RELEVANTE" className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-xs text-ink"><option value="NO_RELEVANTE">No era relevante</option><option value="NO_ES_EL_TONO">No era el tono</option><option value="FALTA_INFO">Faltaba información</option><option value="NO_CONVIENE">No conviene responder</option></select><PendingSubmit pendingLabel="Descartando..." className="rounded-full bg-signal px-3 py-2 text-xs font-bold text-white">Confirmar descarte</PendingSubmit><button type="button" onClick={() => setDiscardOpen(false)} className="px-2 py-2 text-xs font-semibold text-slate">Cancelar</button></form> : <button type="button" onClick={() => setDiscardOpen(true)} className="text-xs font-semibold text-slate/65 underline decoration-slate/30 underline-offset-4 hover:text-signal">Descartar oportunidad</button>}</div>
    </div>
  </article>;
}

function Workspace({ activeClient, youtube, filters, products, opportunities, coverage, optimized = false, coveragePending = false }: { optimized?: boolean; queueEnabled?: boolean; coveragePending?: boolean; coverage: Coverage; activeClient: { slug: string; name: string } | null; youtube: { account: string; connected: boolean; channelTitle: string } | null; filters: { brands: { id: string; name: string }[]; channels: { id: string; name: string }[]; selectedBrand: string; selectedChannel: string; selectedResponse: string; selectedSort: string }; products: ProductOption[]; opportunities: Opportunity[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false);
  const [youtubeDisconnectError, setYoutubeDisconnectError] = useState("");
  const [completed, setCompleted] = useState<CompletedOpportunity[]>([]);
  const filterKey = [activeClient?.slug, filters.selectedBrand, filters.selectedChannel, filters.selectedResponse, filters.selectedSort].join("|");
  useEffect(() => { setCompleted([]); }, [filterKey]);
  const dismissCompletion = useCallback((id: string) => {
    setCompleted((current) => current.map((item) => item.id === id ? { ...item, visible: false } : item));
  }, []);
  const completedIds = new Set(completed.map((item) => item.id));
  const visibleItems: WorkspaceItem[] = opportunities.flatMap((opportunity, position) =>
    completedIds.has(opportunity.id) ? [] : [{ type: "opportunity", opportunity, position }],
  );
  let lastPosition = -1;
  let samePositionOffset = 0;
  for (const completion of [...completed].filter((item) => item.visible).sort((a, b) => a.position - b.position)) {
    samePositionOffset = completion.position === lastPosition ? samePositionOffset + 1 : 0;
    visibleItems.splice(Math.min(completion.position + samePositionOffset, visibleItems.length), 0, { type: "completed", completion });
    lastPosition = completion.position;
  }
  const setParam = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); next.delete("page"); value ? next.set(key, value) : next.delete(key); if (activeClient) next.set("client", activeClient.slug); router.push(`${pathname}?${next.toString()}`); };
  async function disconnectYouTube() {
    if (!activeClient || !youtube?.connected || !window.confirm("¿Desconectar esta cuenta de YouTube? No se podrá publicar hasta volver a conectarla.")) return;
    setDisconnectingYouTube(true);
    setYoutubeDisconnectError("");
    try {
      const response = await fetch(`/api/integrations/youtube?client=${encodeURIComponent(activeClient.slug)}&account=${encodeURIComponent(youtube.account)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo desconectar la cuenta.");
      router.refresh();
    } catch (error) {
      setYoutubeDisconnectError(error instanceof Error ? error.message : "No se pudo desconectar la cuenta.");
    } finally {
      setDisconnectingYouTube(false);
    }
  }

  return <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8"><header className="grid gap-5 border-b border-ink/10 pb-7 md:grid-cols-[1fr_auto] md:items-end"><div><h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Asistente CM</h1><Link href={activeClient ? `/historial?client=${encodeURIComponent(activeClient.slug)}` : "/historial"} className="mt-3 inline-flex rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white">Ver respuestas enviadas →</Link></div><div className="rounded-2xl border border-moss/20 bg-moss/[0.06] px-4 py-3 text-sm text-ink"><span className="font-bold">{activeClient?.name ?? "Sin cliente"}</span><br /><span className="text-xs text-slate">YouTube: {youtube?.connected ? "publicación por API" : "conexión pendiente"}. Meta: publicación manual.</span>{youtube?.connected ? <><button type="button" onClick={disconnectYouTube} disabled={disconnectingYouTube} className="mt-3 block text-xs font-bold text-slate underline decoration-slate/35 underline-offset-4 transition hover:text-ink disabled:cursor-wait disabled:opacity-60">{disconnectingYouTube ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Desconectando…</span> : "Desconectar cuenta de YouTube"}</button>{youtubeDisconnectError ? <p role="alert" className="mt-2 text-xs font-medium text-red-600">{youtubeDisconnectError}</p> : null}</> : null}</div></header>
    <CoveragePanel visibleIds={opportunities.map(opportunity => opportunity.id)} client={activeClient?.slug || ""} initial={coverage} pending={coveragePending} optimized={optimized} />
    <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-white/65 p-3"><label className="text-xs font-bold text-slate/70">Marca<select value={filters.selectedBrand} onChange={(event) => setParam("brand", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="text-xs font-bold text-slate/70">Red<select value={filters.selectedChannel} onChange={(event) => setParam("channel", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label className="text-xs font-bold text-slate/70">Respuesta<select value={filters.selectedResponse} onChange={(event) => setParam("response", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option><option value="generated">Con respuesta generada</option><option value="missing">Sin respuesta</option><option value="stale">Por actualizar</option><option value="fresh">Actualizadas</option><option value="review">Propuestas para revisar</option><option value="error">Con error</option></select></label><label className="text-xs font-bold text-slate/70">Orden<select value={filters.selectedSort} onChange={(event) => setParam("sort", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Relevancia</option><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option></select></label></div>
    <section className="mt-5 grid gap-4">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-moss">Para revisar hoy</p><h2 className="mt-1 font-display text-2xl text-ink">Oportunidades encontradas</h2></div>
      {visibleItems.length > 0 ? visibleItems.map((item) => item.type === "completed"
        ? <CompletedOpportunityCard key={item.completion.id} completion={item.completion} clientSlug={activeClient?.slug ?? ""} onDismiss={dismissCompletion} />
        : <OpportunityCard key={item.opportunity.id} opportunity={item.opportunity} clientSlug={activeClient?.slug ?? ""} youtube={youtube} products={products} onCompleted={(kind, moveFocus) => {
          window.dispatchEvent(new CustomEvent("cm-opportunity-completed", { detail: { id: item.opportunity.id, status: item.opportunity.freshness } }));
          setCompleted((current) => [...current.filter((entry) => entry.id !== item.opportunity.id), { id: item.opportunity.id, kind, position: item.position, visible: true, moveFocus }]);
        }} />
      ) : <div className="rounded-2xl border border-dashed border-ink/15 bg-white/55 px-5 py-14 text-center text-sm text-slate">No hay oportunidades para revisar hoy.</div>}
    </section>
  </div>;
}

export function CopilotWorkspace(props: Parameters<typeof Workspace>[0]) { return <CMRuntime key={props.activeClient?.slug} client={props.activeClient?.slug || ""} optimized={!!props.optimized} queue={!!props.queueEnabled}><Workspace {...props} /></CMRuntime>; }
