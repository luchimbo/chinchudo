"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { discardCopilotOpportunity, generateCopilotDrafts, markCopilotResponse, publishCopilotYouTubeResponse, regenerateCopilotResponse } from "@/app/(app)/opportunities/actions";
import { communityFromUrl, formatAuthor } from "@/lib/source-author";
import { copyToClipboard } from "./clipboard";
import { RefinementChat, type ChatMessage } from "./RefinementChat";

type Response = { id: string; text: string; variantType: string; isPrimary: boolean; persona: string; acceptedAsCorrect: boolean; chatHistory: ChatMessage[] };
type Opportunity = { id: string; text: string; notes: string; author: string; sourceUrl: string; channel: string; brand: string; product: string; productId: string; createdAt: string; status: string; responses: Response[] };
type ProductOption = { id: string; name: string; brand: string };
type ProductChoice = { id: string; name: string };

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const shown = selected ?? current;

  const searchable = useMemo(() => [{ id: "", name: NO_PRODUCT_LABEL, brand: "" }, ...products]
    .map((option) => ({ ...option, search: normalizeSearch(`${option.name} ${option.brand}`) })), [products]);
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

// Muchas fuentes (ej. resultados de YouTube) pegan el título de la publicación
// al final del texto scrapeado, después de "Published <fecha>". Cuando aparece
// ese patrón lo mostramos como título separado; si no, todo el texto queda
// como descripción.
const SOURCE_TITLE_PATTERN = /^(.*?)\s*Published\s+[A-Za-z]+\s+\d{1,2},?\s*\d{4}\s*(.+?)\s*-\s*YouTube\s*$/i;

function splitTitleFromText(raw: string): { title: string | null; description: string } {
  const text = cleanPreview(raw);
  const match = text.match(SOURCE_TITLE_PATTERN);
  if (match && match[2].trim()) return { title: match[2].trim(), description: match[1].trim() };
  return { title: null, description: text };
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
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-60`}>{pending ? pendingLabel : children}</button>;
}

// Vive dentro del formulario de publicación, así que es type="button" y llama a la acción directamente.
function RegenerateButton({ opportunityId, responseId, acceptedAsCorrect }: { opportunityId: string; responseId: string; acceptedAsCorrect: boolean }) {
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    const warning = acceptedAsCorrect
      ? "La versión aceptada queda guardada como ejemplo."
      : "Si ajustaste esta respuesta con el chat y no la aceptaste, esa conversación se pierde sin que la IA aprenda de ella.";
    if (!window.confirm(`¿Regenerar la respuesta con lo que aprendió la IA? Se reemplaza el texto actual.\n\n${warning}`)) return;
    setRegenerating(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("opportunityId", opportunityId);
      formData.set("responseId", responseId);
      await regenerateCopilotResponse(formData);
    } catch {
      setError("No se pudo regenerar la respuesta. Probá de nuevo en un momento.");
    } finally {
      setRegenerating(false);
    }
  }

  return <>
    <button type="button" onClick={regenerate} disabled={regenerating} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-bold text-ink transition hover:border-ink/40 disabled:cursor-wait disabled:opacity-60">{regenerating ? "Regenerando…" : "↻ Regenerar con lo aprendido"}</button>
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
  const [choice, setChoice] = useState<ProductChoice | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changesProduct = choice !== null && choice.id !== current.id;

  async function apply() {
    if (!choice || !changesProduct) return;
    if (!window.confirm(`¿Rehacer la propuesta con «${choice.name}»? Se reemplaza el texto actual.`)) return;
    setApplying(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("opportunityId", opportunityId);
      formData.set("responseId", responseId);
      formData.set("productId", choice.id);
      await regenerateCopilotResponse(formData);
    } catch {
      setError("No se pudo rehacer la propuesta con ese producto. Probá de nuevo en un momento.");
    } finally {
      setApplying(false);
    }
  }

  return <div className="mb-3">
    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/70">Producto de la propuesta</p>
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-[200px] flex-1"><ProductCombobox products={products} current={current} selected={choice} onSelect={setChoice} disabled={applying} /></div>
      <button type="button" onClick={apply} disabled={!changesProduct || applying} className="rounded-full bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-slate disabled:cursor-not-allowed disabled:opacity-40">{applying ? "Rehaciendo…" : "Rehacer propuesta"}</button>
    </div>
    {error ? <p className="mt-1.5 text-[11px] font-medium text-red-600">{error}</p> : null}
  </div>;
}

function ResponseCard({ response, text, setText, opportunityId, sourceUrl, channel, clientSlug, youtube, productPicker }: { response: Response; text: string; setText: (text: string) => void; opportunityId: string; sourceUrl: string; channel: string; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; productPicker: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [openingSource, setOpeningSource] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const isYouTube = channel.toLowerCase() === "youtube";
  const youtubeConnectUrl = `/api/integrations/youtube/connect?client=${encodeURIComponent(clientSlug)}&account=${encodeURIComponent(youtube?.account ?? "youtube-principal")}`;

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
    <form action={isYouTube && youtube?.connected ? publishCopilotYouTubeResponse : markCopilotResponse}>
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <input type="hidden" name="responseId" value={response.id} />
      <input type="hidden" name="wasEdited" value={text.trim() !== response.text.trim() ? "true" : "false"} />
      {isYouTube ? <input type="hidden" name="account" value={youtube?.account ?? "youtube-principal"} /> : null}
      <textarea name="editedText" value={text} onChange={(event) => setText(event.target.value)} maxLength={280} rows={4} className="w-full resize-y rounded-lg border border-ink/10 bg-paper/65 px-3 py-2.5 text-sm leading-6 text-ink outline-none transition focus:border-brass" />
      <p className="mt-1 text-right text-[11px] text-slate/60">{text.length}/280</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-full border border-ink/15 px-3 py-2 text-xs font-bold text-ink transition hover:border-ink/40">{copied ? "Copiado" : "Copiar"}</button>
        {isYouTube ? (
          youtube?.connected ? <PendingSubmit pendingLabel="Publicando en YouTube…" className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85">Publicar en YouTube</PendingSubmit> : <a href={youtubeConnectUrl} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85">Conectar cuenta de YouTube</a>
        ) : <>
          <PendingSubmit pendingLabel="Guardando..." className="rounded-full bg-ink px-3 py-2 text-xs font-bold text-paper transition hover:bg-slate">Guardar como respondida</PendingSubmit>
          <button type="button" onClick={openForPublishing} disabled={openingSource} className="rounded-full bg-moss px-3 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:cursor-wait disabled:opacity-60">{openingSource ? "Copiando y abriendo..." : "Abrir para publicar"}</button>
        </>}
        <RegenerateButton opportunityId={opportunityId} responseId={response.id} acceptedAsCorrect={response.acceptedAsCorrect} />
      </div>
      {isYouTube ? <p className="mt-2 text-[11px] font-medium text-slate/65">{youtube?.connected ? `Se publicará con la cuenta conectada${youtube.channelTitle ? `: ${youtube.channelTitle}` : ""}.` : "Conectá una cuenta para publicar sin abrir YouTube."}</p> : null}
      {!isYouTube && popupBlocked ? <p className="mt-2 text-[11px] font-medium text-red-600">El navegador bloqueó la pestaña nueva. El texto ya está copiado: permití popups para esta web y volvé a tocarlo, o pegá el comentario en una pestaña que abras vos.</p> : null}
    </form>
  </div>;
}

function ResponseWithChat({ response, opportunityId, sourceUrl, channel, clientSlug, youtube, productPicker }: { response: Response; opportunityId: string; sourceUrl: string; channel: string; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; productPicker: React.ReactNode }) {
  // El texto vive acá para que el chat pueda reemplazar la versión editable.
  const [text, setText] = useState(response.text);
  return <div className="grid gap-4 lg:grid-cols-2">
    <ResponseCard response={response} text={text} setText={setText} opportunityId={opportunityId} sourceUrl={sourceUrl} channel={channel} clientSlug={clientSlug} youtube={youtube} productPicker={productPicker} />
    <RefinementChat opportunityId={opportunityId} responseId={response.id} clientSlug={clientSlug} currentText={text} initialHistory={response.chatHistory} acceptedAsCorrect={response.acceptedAsCorrect} onApplyResponse={setText} />
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

function OpportunityCard({ opportunity, clientSlug, youtube, products }: { opportunity: Opportunity; clientSlug: string; youtube: { account: string; connected: boolean; channelTitle: string } | null; products: ProductOption[] }) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const [generateChoice, setGenerateChoice] = useState<ProductChoice | null>(null);
  const currentProduct = { id: opportunity.productId, name: opportunity.product || NO_PRODUCT_LABEL };
  const date = new Date(opportunity.createdAt).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  const responses = useMemo(() => [...opportunity.responses].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)), [opportunity.responses]);
  const response = responses[0];
  const { title, description } = useMemo(() => splitTitleFromText(opportunity.text), [opportunity.text]);
  const aiReason = useMemo(() => getAiReason(opportunity.notes), [opportunity.notes]);
  const [reasonOpen, setReasonOpen] = useState(false);

  // Sin overflow-hidden: el desplegable de productos tiene que poder salir de la tarjeta.
  return <article id={`op-${opportunity.id}`} className="scroll-mt-6 break-words rounded-2xl border border-ink/10 bg-white/85 shadow-panel">
    <div className="border-b border-ink/10 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate/70"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-ink/7 px-2.5 py-1 text-ink">{opportunity.channel}</span>{opportunity.product ? <span className="text-slate/50">{opportunity.product}</span> : null}</div><span>{date}</span></div><AuthorLine author={opportunity.author} channel={opportunity.channel} sourceUrl={opportunity.sourceUrl} /><div className="mt-3 max-w-3xl">{title ? <p className="font-display text-lg font-bold leading-6 text-ink">{title}</p> : null}<ExpandableText text={description} limit={240} className={`whitespace-pre-wrap text-[15px] leading-7 text-slate/80 ${title ? "mt-1.5" : ""}`} /></div><div className="mt-4 flex flex-wrap items-center gap-2"><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink/40">Abrir fuente</a>{aiReason ? <button type="button" onClick={() => setReasonOpen((value) => !value)} className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-slate/65 underline decoration-slate/25 underline-offset-4 hover:text-ink">Razón IA<span aria-hidden="true" className={`transition-transform ${reasonOpen ? "rotate-180" : ""}`}>▾</span></button> : null}</div>{aiReason && reasonOpen ? <div className="mt-3 max-w-3xl rounded-md bg-paper p-3 text-sm leading-6 text-slate">{aiReason}</div> : null}</div>
    <div className="px-5 py-5">
      {!response ? <form action={generateCopilotDrafts} className="rounded-xl bg-paper p-4">
        <input type="hidden" name="opportunityId" value={opportunity.id} />
        {products.length > 0 ? <div className="mb-3 max-w-md"><p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate/70">Producto para la propuesta</p><ProductCombobox products={products} current={currentProduct} selected={generateChoice} onSelect={setGenerateChoice} /></div> : null}
        {generateChoice ? <input type="hidden" name="productId" value={generateChoice.id} /> : null}
        <PendingSubmit pendingLabel="Generando respuesta..." className="rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-slate">Generar respuesta</PendingSubmit>
        <p className="mt-2 text-xs text-slate/70">{generateChoice ? `Se genera con ${generateChoice.id ? `las características de ${generateChoice.name}` : "ningún producto específico"}, además de lo que la IA aprendió de los chats.` : "Se genera con las reglas y respuestas correctas que la IA aprendió de los chats. Después la podés ajustar acá mismo."}</p>
      </form> : <ResponseWithChat key={response.id} response={response} opportunityId={opportunity.id} sourceUrl={opportunity.sourceUrl} channel={opportunity.channel} clientSlug={clientSlug} youtube={youtube} productPicker={products.length > 0 ? <ProposalProductPicker opportunityId={opportunity.id} responseId={response.id} products={products} current={currentProduct} /> : null} />}
      <div className="mt-4">{discardOpen ? <form action={discardCopilotOpportunity} className="flex flex-wrap items-center gap-2 rounded-xl border border-signal/20 bg-signal/[0.04] p-3"><input type="hidden" name="opportunityId" value={opportunity.id} /><select name="reason" defaultValue="NO_RELEVANTE" className="rounded-lg border border-ink/15 bg-white px-2 py-2 text-xs text-ink"><option value="NO_RELEVANTE">No era relevante</option><option value="NO_ES_EL_TONO">No era el tono</option><option value="FALTA_INFO">Faltaba información</option><option value="NO_CONVIENE">No conviene responder</option></select><PendingSubmit pendingLabel="Descartando..." className="rounded-full bg-signal px-3 py-2 text-xs font-bold text-white">Confirmar descarte</PendingSubmit><button type="button" onClick={() => setDiscardOpen(false)} className="px-2 py-2 text-xs font-semibold text-slate">Cancelar</button></form> : <button type="button" onClick={() => setDiscardOpen(true)} className="text-xs font-semibold text-slate/65 underline decoration-slate/30 underline-offset-4 hover:text-signal">Descartar oportunidad</button>}</div>
    </div>
  </article>;
}

export function CopilotWorkspace({ activeClient, youtube, filters, products, opportunities }: { activeClient: { slug: string; name: string } | null; youtube: { account: string; connected: boolean; channelTitle: string } | null; filters: { brands: { id: string; name: string }[]; channels: { id: string; name: string }[]; selectedBrand: string; selectedChannel: string; selectedResponse: string; selectedSort: string }; products: ProductOption[]; opportunities: Opportunity[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [disconnectingYouTube, setDisconnectingYouTube] = useState(false);
  const [youtubeDisconnectError, setYoutubeDisconnectError] = useState("");
  const setParam = (key: string, value: string) => { const next = new URLSearchParams(params.toString()); value ? next.set(key, value) : next.delete(key); if (activeClient) next.set("client", activeClient.slug); router.push(`${pathname}?${next.toString()}`); };
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

  return <div className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8"><header className="grid gap-5 border-b border-ink/10 pb-7 md:grid-cols-[1fr_auto] md:items-end"><div><h1 className="font-display text-4xl leading-none text-ink md:text-5xl">Asistente CM</h1><Link href={activeClient ? `/historial?client=${encodeURIComponent(activeClient.slug)}` : "/historial"} className="mt-3 inline-flex rounded-full border border-ink/15 px-3 py-1.5 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white">Ver respuestas enviadas →</Link></div><div className="rounded-2xl border border-moss/20 bg-moss/[0.06] px-4 py-3 text-sm text-ink"><span className="font-bold">{activeClient?.name ?? "Sin cliente"}</span><br /><span className="text-xs text-slate">YouTube: {youtube?.connected ? "publicación por API" : "conexión pendiente"}. Meta: publicación manual.</span>{youtube?.connected ? <><button type="button" onClick={disconnectYouTube} disabled={disconnectingYouTube} className="mt-3 block text-xs font-bold text-slate underline decoration-slate/35 underline-offset-4 transition hover:text-ink disabled:cursor-wait disabled:opacity-60">{disconnectingYouTube ? "Desconectando…" : "Desconectar cuenta de YouTube"}</button>{youtubeDisconnectError ? <p className="mt-2 text-xs font-medium text-red-600">{youtubeDisconnectError}</p> : null}</> : null}</div></header>
    <div className="mt-6 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-white/65 p-3"><label className="text-xs font-bold text-slate/70">Marca<select value={filters.selectedBrand} onChange={(event) => setParam("brand", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label><label className="text-xs font-bold text-slate/70">Red<select value={filters.selectedChannel} onChange={(event) => setParam("channel", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option>{filters.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select></label><label className="text-xs font-bold text-slate/70">Respuesta<select value={filters.selectedResponse} onChange={(event) => setParam("response", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Todas</option><option value="generated">Con respuesta generada</option></select></label><label className="text-xs font-bold text-slate/70">Orden<select value={filters.selectedSort} onChange={(event) => setParam("sort", event.target.value)} className="ml-2 rounded-lg border border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink"><option value="">Relevancia</option><option value="newest">Más recientes</option><option value="oldest">Más antiguas</option></select></label></div><section className="mt-5 grid gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-moss">Para revisar hoy</p><h2 className="mt-1 font-display text-2xl text-ink">Oportunidades encontradas</h2></div>{opportunities.length > 0 ? opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} clientSlug={activeClient?.slug ?? ""} youtube={youtube} products={products} />) : <div className="rounded-2xl border border-dashed border-ink/15 bg-white/55 px-5 py-14 text-center text-sm text-slate">No hay oportunidades para revisar hoy.</div>}</section>
  </div>;
}
