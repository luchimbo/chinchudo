"use client";

import { useEffect, useRef, useState } from "react";
import { acceptCopilotRefinementAction, applyChatSuggestionAction, applyRefinedResponseAction, saveRefinementChatAction, sendRefinementMessageAction } from "@/app/(app)/opportunities/actions";
import type { ChatMessage, ChatSuggestion } from "@/lib/refine-draft";
import { copyToClipboard } from "./clipboard";

export type { ChatMessage };

const SUGGESTIONS = ["Más corta", "Más directa", "Sin tecnicismos", "Menos venta"];
// Mismo tope que la propuesta del Asistente CM (COPILOT_MAX_CHARACTERS).
const MAX_CHARACTERS = 280;

function formDataFrom(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.append(key, value);
  return formData;
}

// Propuesta de la IA dentro del chat: se edita ahí mismo y recién "Usar esta respuesta" la pasa a la propuesta.
function SuggestionCard({ suggestion, inProposal, disabled, applying, onSave, onUse }: {
  suggestion: ChatSuggestion;
  inProposal: boolean;
  disabled: boolean;
  applying: boolean;
  onSave: (text: string) => void;
  onUse: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.text);
  const [copied, setCopied] = useState(false);
  const length = editing ? draft.length : suggestion.text.length;
  const tooLong = length > MAX_CHARACTERS;
  const edited = suggestion.text.trim() !== suggestion.original.trim();

  function startEditing() {
    setDraft(suggestion.text);
    setEditing(true);
  }

  function save() {
    const text = draft.trim();
    if (text.length < 3) return;
    if (text !== suggestion.text) onSave(text);
    setEditing(false);
  }

  async function copy() {
    await copyToClipboard(suggestion.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <div className={`w-full rounded-xl border bg-white p-3 ${inProposal ? "border-moss/45" : "border-ink/12"}`}>
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brass">Propuesta sugerida</span>
      {edited ? <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-slate">Editada</span> : null}
      {inProposal ? <span className="rounded-full bg-moss/10 px-2 py-0.5 text-[10px] font-bold text-moss">En la propuesta</span> : null}
      <span className={`ml-auto text-[11px] font-medium ${tooLong ? "text-red-600" : "text-slate/60"}`}>{length}/{MAX_CHARACTERS}</span>
    </div>
    {editing ? <textarea
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setEditing(false);
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save(); }
      }}
      autoFocus
      rows={Math.min(8, Math.max(3, Math.ceil(draft.length / 45)))}
      aria-label="Editar propuesta sugerida"
      className="w-full resize-y rounded-lg border border-brass/50 bg-paper/50 px-2.5 py-2 text-sm leading-6 text-ink outline-none focus:border-brass"
    /> : <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{suggestion.text}</p>}
    {tooLong ? <p className="mt-1.5 text-[11px] font-medium text-red-600">Pasa de {MAX_CHARACTERS} caracteres: acortala para poder usarla.</p> : null}
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {editing ? <>
        <button type="button" onClick={save} disabled={draft.trim().length < 3} className="rounded-full bg-ink px-3 py-1.5 text-[11px] font-bold text-paper transition hover:bg-slate disabled:opacity-50">Guardar cambios</button>
        <button type="button" onClick={() => setEditing(false)} className="rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-slate hover:text-ink">Cancelar</button>
      </> : <>
        <button type="button" onClick={onUse} disabled={disabled || tooLong || inProposal} className="rounded-full bg-moss px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-moss/85 disabled:cursor-not-allowed disabled:opacity-50">{applying ? "Pasando a la propuesta…" : "Usar esta respuesta"}</button>
        <button type="button" onClick={startEditing} disabled={disabled} className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-bold text-ink transition hover:border-ink/40 disabled:opacity-50">✎ Editar</button>
        <button type="button" onClick={copy} className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] font-bold text-ink transition hover:border-ink/40">{copied ? "Copiado" : "Copiar"}</button>
      </>}
    </div>
  </div>;
}

export function RefinementChat({ opportunityId, responseId, clientSlug, currentText, initialHistory, acceptedAsCorrect, onApplyResponse }: {
  opportunityId: string;
  responseId: string;
  clientSlug: string;
  currentText: string;
  initialHistory: ChatMessage[];
  acceptedAsCorrect: boolean;
  onApplyResponse: (text: string) => void;
}) {
  const [history, setHistory] = useState<ChatMessage[]>(initialHistory);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [applyingIndex, setApplyingIndex] = useState<number | null>(null);
  // Guardamos el texto aceptado: si después se edita, deja de figurar como aceptado.
  const [acceptedText, setAcceptedText] = useState<string | null>(acceptedAsCorrect ? currentText : null);
  const accepted = acceptedText !== null && acceptedText.trim() === currentText.trim();
  const [learnedRules, setLearnedRules] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = sending || compiling || accepting || applyingIndex !== null;

  // Solo baja al final cuando llega un mensaje nuevo, no al editar una propuesta vieja.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history.length, sending]);

  // Un fallo al persistir el hilo no debe parecer un fallo de la conversación.
  function persist(next: ChatMessage[]) {
    saveRefinementChatAction(formDataFrom({ responseId, chatHistory: JSON.stringify(next) })).catch(() => {});
  }

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    const updated: ChatMessage[] = [...history, { sender: "user", text, timestamp: new Date().toISOString() }];
    setHistory(updated);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const result = await sendRefinementMessageAction(formDataFrom({ responseId, userMessage: text, chatHistory: JSON.stringify(updated), currentText }));
      if (!result.success) throw new Error("No se pudo enviar el mensaje.");
      const reply: ChatMessage = {
        sender: "assistant",
        text: result.reply,
        timestamp: new Date().toISOString(),
        ...(result.suggestion ? { suggestion: { text: result.suggestion, original: result.suggestion } } : {}),
      };
      const completed = [...updated, reply];
      setHistory(completed);
      persist(completed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con la IA.");
    } finally {
      setSending(false);
    }
  }

  function saveSuggestion(index: number, text: string) {
    const next = history.map((message, position) => position === index && message.suggestion
      ? { ...message, suggestion: { ...message.suggestion, text } }
      : message);
    setHistory(next);
    persist(next);
  }

  async function applySuggestion(index: number) {
    const suggestion = history[index]?.suggestion;
    if (!suggestion || busy) return;
    setApplyingIndex(index);
    setError(null);
    try {
      await applyChatSuggestionAction(formDataFrom({ responseId, text: suggestion.text, chatHistory: JSON.stringify(history) }));
      onApplyResponse(suggestion.text);
    } catch {
      // En producción Next oculta el detalle del error del servidor: mensaje propio y claro.
      setError("No se pudo pasar la propuesta a la respuesta. Probá de nuevo en un momento.");
    } finally {
      setApplyingIndex(null);
    }
  }

  async function compile() {
    if (busy || history.length === 0) return;
    setCompiling(true);
    setError(null);
    try {
      const result = await applyRefinedResponseAction(formDataFrom({ responseId, chatHistory: JSON.stringify(history) }));
      if (!result.success) throw new Error("No se pudo generar la respuesta.");
      onApplyResponse(result.compiledText);
      // La versión nueva también queda en el chat, para poder editarla ahí mismo.
      const next: ChatMessage[] = [...history, {
        sender: "assistant",
        text: "Nueva versión con todo lo que hablamos:",
        timestamp: new Date().toISOString(),
        suggestion: { text: result.compiledText, original: result.compiledText },
      }];
      setHistory(next);
      persist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al generar la nueva versión.");
    } finally {
      setCompiling(false);
    }
  }

  async function accept() {
    if (busy || currentText.trim().length < 3) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptCopilotRefinementAction(formDataFrom({ opportunityId, responseId, editedText: currentText }));
      setAcceptedText(currentText);
      setLearnedRules(result.learnedRules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la respuesta.");
    } finally {
      setAccepting(false);
    }
  }

  return <div className="flex h-full min-h-[420px] flex-col overflow-hidden rounded-xl border border-ink/10 bg-white">
    <div className="flex items-center justify-between gap-3 border-b border-ink/10 bg-paper/60 px-4 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brass">Ajustar con IA</p>
      {accepted ? <span className="rounded-full bg-moss/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-moss">Respuesta correcta guardada</span> : null}
    </div>
    <div ref={scrollRef} className="max-h-[420px] min-h-[200px] flex-1 space-y-3 overflow-y-auto p-4">
      {history.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-ink">¿Qué querés ajustar de esta respuesta?</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} disabled={busy} className="rounded-full border border-ink/12 bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50">{suggestion}</button>)}</div>
      </div> : history.map((message, index) => message.sender === "user"
        ? <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-none bg-ink px-3.5 py-2.5 text-sm leading-6 text-paper">{message.text}</div></div>
        : <div key={index} className="flex justify-start"><div className="flex w-full max-w-[92%] flex-col items-start gap-2">
          {message.text ? <div className="whitespace-pre-wrap rounded-2xl rounded-bl-none border border-ink/10 bg-paper/50 px-3.5 py-2.5 text-sm leading-6 text-ink">{message.text}</div> : null}
          {message.suggestion ? <SuggestionCard
            suggestion={message.suggestion}
            inProposal={message.suggestion.text.trim() === currentText.trim()}
            disabled={busy}
            applying={applyingIndex === index}
            onSave={(text) => saveSuggestion(index, text)}
            onUse={() => applySuggestion(index)}
          /> : null}
        </div></div>)}
      {sending ? <div className="flex justify-start"><div className="rounded-2xl rounded-bl-none border border-ink/10 bg-paper/50 px-3.5 py-2.5 text-sm text-slate">Escribiendo…</div></div> : null}
    </div>
    {error ? <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    {accepted && learnedRules ? <div className="mx-4 mb-2 rounded-lg bg-moss/[0.06] px-3 py-2 text-xs leading-5 text-ink">
      <div className="flex items-center justify-between gap-2"><span className="font-bold">{learnedRules.length > 0 ? `Aprendido (${learnedRules.length})` : "No se detectaron reglas nuevas en este chat"}</span><a href={`/aprendizaje${clientSlug ? `?client=${encodeURIComponent(clientSlug)}` : ""}`} className="font-bold text-moss underline decoration-moss/30 underline-offset-4 hover:text-ink">Ver en Aprendizaje</a></div>
      {learnedRules.length > 0 ? <ul className="mt-1.5 list-disc space-y-1 pl-4">{learnedRules.map((rule) => <li key={rule}>{rule}</li>)}</ul> : null}
    </div> : null}
    <div className="border-t border-ink/10 bg-paper/40 p-3">
      <form onSubmit={(event) => { event.preventDefault(); send(input); }} className="flex items-end gap-2">
        <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input); } }} rows={2} disabled={sending} placeholder="Escribí tu indicación y presioná Enter…" className="flex-1 resize-none rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-ink px-4 py-2.5 text-xs font-bold text-paper transition hover:bg-slate disabled:opacity-50">Enviar</button>
      </form>
      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={compile} disabled={busy || history.length === 0} className="rounded-full bg-brass px-3.5 py-2 text-xs font-bold text-white transition hover:bg-ink disabled:opacity-50">{compiling ? "✨ Generando…" : "✨ Generar nueva respuesta"}</button>
        <button type="button" onClick={accept} disabled={busy || accepted} className="rounded-full bg-moss px-3.5 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:opacity-50">{accepting ? "Guardando y aprendiendo…" : accepted ? "Aceptada" : "Aceptar como respuesta correcta"}</button>
      </div>
    </div>
  </div>;
}
