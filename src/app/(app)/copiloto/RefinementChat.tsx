"use client";

import { useEffect, useRef, useState } from "react";
import { acceptCopilotRefinementAction, applyRefinedResponseAction, saveRefinementChatAction, sendRefinementMessageAction } from "@/app/(app)/opportunities/actions";

export type ChatMessage = { sender: "user" | "assistant"; text: string; timestamp?: string };

const SUGGESTIONS = ["Más corta", "Más directa", "Sin tecnicismos", "Menos venta"];

function formDataFrom(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.append(key, value);
  return formData;
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
  // Guardamos el texto aceptado: si después se edita, deja de figurar como aceptado.
  const [acceptedText, setAcceptedText] = useState<string | null>(acceptedAsCorrect ? currentText : null);
  const accepted = acceptedText !== null && acceptedText.trim() === currentText.trim();
  const [learnedRules, setLearnedRules] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = sending || compiling || accepting;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, sending]);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;
    const updated: ChatMessage[] = [...history, { sender: "user", text, timestamp: new Date().toISOString() }];
    setHistory(updated);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const result = await sendRefinementMessageAction(formDataFrom({ responseId, userMessage: text, chatHistory: JSON.stringify(updated) }));
      if (!result.success) throw new Error("No se pudo enviar el mensaje.");
      const completed: ChatMessage[] = [...updated, { sender: "assistant", text: result.reply, timestamp: new Date().toISOString() }];
      setHistory(completed);
      // Un fallo al persistir el hilo no debe parecer un fallo de la conversación.
      saveRefinementChatAction(formDataFrom({ responseId, chatHistory: JSON.stringify(completed) })).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con la IA.");
    } finally {
      setSending(false);
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
    <div ref={scrollRef} className="max-h-[340px] min-h-[200px] flex-1 space-y-3 overflow-y-auto p-4">
      {history.length === 0 ? <div className="flex h-full flex-col items-center justify-center text-center">
        <p className="text-sm font-semibold text-ink">¿Qué querés ajustar de esta respuesta?</p>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">{SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => send(suggestion)} disabled={busy} className="rounded-full border border-ink/12 bg-paper px-2.5 py-1.5 text-[11px] font-semibold text-slate transition hover:border-ink/40 hover:text-ink disabled:opacity-50">{suggestion}</button>)}</div>
      </div> : history.map((message, index) => <div key={index} className={`flex ${message.sender === "user" ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-6 ${message.sender === "user" ? "rounded-br-none bg-ink text-paper" : "rounded-bl-none border border-ink/10 bg-paper/50 text-ink"}`}>{message.text}</div>
      </div>)}
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
        <button type="button" onClick={compile} disabled={busy || history.length === 0} className="rounded-full bg-brass px-3.5 py-2 text-xs font-bold text-white transition hover:bg-ink disabled:opacity-50">{compiling ? "✨ Generando…" : "✨ Generar nueva versión"}</button>
        <button type="button" onClick={accept} disabled={busy || accepted} className="rounded-full bg-moss px-3.5 py-2 text-xs font-bold text-white transition hover:bg-moss/85 disabled:opacity-50">{accepting ? "Guardando y aprendiendo…" : accepted ? "Aceptada" : "Aceptar como respuesta correcta"}</button>
      </div>
    </div>
  </div>;
}
