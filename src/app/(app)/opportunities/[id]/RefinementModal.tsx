"use client";

import React, { useState, useRef, useEffect } from "react";
import { sendRefinementMessageAction, applyRefinedResponseAction } from "../actions";

type ChatMessage = {
  sender: "user" | "assistant";
  text: string;
  timestamp?: string;
};

type RefinementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  responseId: string;
  opportunityText: string;
  brandName: string;
  personaName: string;
  currentResponseText: string;
  initialChatHistory?: ChatMessage[];
  onApplyResponse: (newText: string, updatedChatHistory: ChatMessage[]) => void;
};

export function RefinementModal({
  isOpen,
  onClose,
  responseId,
  opportunityText,
  brandName,
  personaName,
  currentResponseText,
  initialChatHistory = [],
  onApplyResponse,
}: RefinementModalProps) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(initialChatHistory);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setChatHistory(initialChatHistory);
      setInput("");
      setError(null);
    }
  }, [isOpen, initialChatHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, isLoading]);

  if (!isOpen) return null;

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    const userMsg: ChatMessage = { sender: "user", text: message, timestamp: new Date().toISOString() };
    const updatedHistory = [...chatHistory, userMsg];
    setChatHistory(updatedHistory);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("responseId", responseId);
      formData.append("userMessage", message);
      formData.append("chatHistory", JSON.stringify(updatedHistory));

      const result = await sendRefinementMessageAction(formData);
      if (!result.success) {
        throw new Error("No se pudo enviar el mensaje.");
      }
      setChatHistory((prev) => [
        ...prev,
        { sender: "assistant", text: result.reply, timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con la IA.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompile = async () => {
    if (isCompiling || chatHistory.length === 0) return;
    setIsCompiling(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("responseId", responseId);
      formData.append("chatHistory", JSON.stringify(chatHistory));

      const result = await applyRefinedResponseAction(formData);
      if (!result.success) {
        throw new Error("No se pudo generar la respuesta.");
      }
      onApplyResponse(result.compiledText, chatHistory);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al compilar la respuesta.");
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 bg-paper px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">
              Ajustar con IA
            </p>
            <h2 className="font-display text-2xl text-ink">
              Chat de refinamiento
            </h2>
            <p className="mt-1 text-xs text-slate">
              {personaName} · {brandName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/15 px-4 py-2 text-sm font-bold text-ink transition hover:bg-white"
          >
            Cerrar
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Context */}
          <div className="hidden w-80 flex-col border-r border-ink/10 bg-paper/50 p-5 lg:flex">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate/70">
              Comentario original
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {opportunityText}
            </p>
            <div className="mt-6 rounded-lg border border-ink/10 bg-white p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate/70">
                Borrador actual
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {currentResponseText}
              </p>
            </div>
          </div>

          {/* Right: Chat */}
          <div className="flex flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
              {chatHistory.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate">
                  <p className="font-display text-lg text-ink">
                    ¿Qué querés ajustar de esta respuesta?
                  </p>
                  <p className="mt-2 max-w-md text-sm">
                    Escribile a la IA para que te ayude a mejorar el texto. Por ejemplo: “más corta”, “recalcá las cuotas”, “sin tecnicismos”.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatHistory.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.sender === "user"
                            ? "bg-ink text-paper rounded-br-none"
                            : "bg-white border border-ink/10 text-ink rounded-bl-none shadow-sm"
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl rounded-bl-none border border-ink/10 bg-white px-4 py-3 text-sm text-slate shadow-sm">
                        Escribiendo…
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="border-t border-ink/10 bg-paper/50 p-4">
              <form onSubmit={handleSend} className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  rows={2}
                  placeholder="Escribí tu indicación y presioná Enter…"
                  className="flex-1 resize-none rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="rounded-xl bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-slate-850 disabled:opacity-50"
                >
                  {isLoading ? "…" : "Enviar"}
                </button>
              </form>

              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate/60">
                  Shift + Enter para nueva línea
                </span>
                <button
                  type="button"
                  onClick={handleCompile}
                  disabled={isCompiling || chatHistory.length === 0}
                  className="rounded-xl bg-brass px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
                >
                  {isCompiling ? "✨ Generando…" : "✨ Generar nueva respuesta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
