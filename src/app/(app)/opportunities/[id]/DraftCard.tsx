"use client";

import React, { useState } from "react";
import { SubmitButton } from "./SubmitButton";

type PublishingLogEntry = {
  id: string;
  publishedUrl: string;
  publishedAt: string | Date;
  publishedBy: string;
  result: string;
  followUpNeeded: boolean;
  account: string;
};

type ResponseEntry = {
  id: string;
  variantType: string;
  draftText: string;
  editedText: string;
  riskNotes: string;
  approvedBy: string;
  brand: { name: string };
  persona: { name: string };
  publishingLog?: PublishingLogEntry | null;
};

type OpportunityEntry = {
  id: string;
  sourceUrl: string;
  sourceAuthor: string;
  sourceText: string;
  channel: { name: string };
};

type AgentAccount = { name: string; label: string };

type DraftCardProps = {
  response: ResponseEntry;
  opportunity: OpportunityEntry;
  clientSlug?: string | null;
  approveResponseAction: (formData: FormData) => Promise<void>;
  deleteResponseAction: (formData: FormData) => Promise<void>;
  markAsPublishedAction: (formData: FormData) => Promise<void>;
  publishViaAgentAction?: (formData: FormData) => Promise<void>;
  agentAccounts?: AgentAccount[];
  suggestedAccount?: string | null;
  canPublishViaAgent?: boolean;
  clientParam?: string;
  isAlreadyPublished?: boolean;
};

function getPersonaDisplayName(name: string, clientSlug?: string | null) {
  if (clientSlug === "prestige-running") {
    if (name === "Baterista de Departamento") return "El Corredor";
    if (name === "Técnico / Productor") return "Kinesiólogo";
    if (name === "Trend-Setter Kressmer") return "Trend Setter";
    if (name === "Profe / Madre-Padre") return "Escolar / Padres";
  }
  if (name === "Trend-Setter Kressmer") return "Trend Setter";
  if (name === "Profe / Madre-Padre") return "Profe de Música";
  return name;
}

function getBrandAvatarStyles(brandName: string) {
  const nameLower = brandName.toLowerCase();
  if (nameLower.includes("midiplus")) return { bg: "bg-moss", text: "text-white", label: "MidiPlus" };
  if (nameLower.includes("kressmer")) return { bg: "bg-brass", text: "text-white", label: "Kressmer" };
  if (nameLower.includes("prestige")) return { bg: "bg-ink", text: "text-paper", label: "Prestige" };
  return { bg: "bg-slate-700", text: "text-white", label: brandName.slice(0, 2) };
}

export function DraftCard({
  response,
  opportunity,
  clientSlug,
  approveResponseAction,
  deleteResponseAction,
  markAsPublishedAction,
  publishViaAgentAction,
  agentAccounts = [],
  suggestedAccount,
  canPublishViaAgent,
  clientParam,
  isAlreadyPublished = false,
}: DraftCardProps) {
  const [text, setText] = useState(response.editedText || response.draftText);
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirm("¿Estás seguro de que querés eliminar esta respuesta/variante generada? Esta acción no se puede deshacer.")) {
      setIsDeleting(true);
      try {
        const formData = new FormData();
        formData.append("responseId", response.id);
        formData.append("opportunityId", opportunity.id);
        await deleteResponseAction(formData);
      } catch (err) {
        console.error("Error al eliminar la respuesta:", err);
        alert("Hubo un error al intentar eliminar la respuesta.");
        setIsDeleting(false);
      }
    }
  };

  const brandStyle = getBrandAvatarStyles(response.brand.name);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <article className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur transition-all duration-300 hover:shadow-md">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/5 pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate/60">
            {response.variantType} / {getPersonaDisplayName(response.persona.name, clientSlug)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${brandStyle.bg} ${brandStyle.text}`}>
              {brandStyle.label[0]}
            </span>
            <span className="text-sm font-bold text-ink">{response.brand.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-full border border-ink/15 bg-white/80 px-3.5 py-1 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white"
          >
            {isCopied ? "¡Copiado!" : "Copiar"}
          </button>
          {response.approvedBy ? (
            <span className="rounded-full bg-moss px-3 py-1 text-xs font-bold text-white shadow-sm">
              ✓ Aprobada
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <form action={approveResponseAction} className="flex flex-col justify-between gap-4">
          <input type="hidden" name="responseId" value={response.id} />
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <input type="hidden" name="approvedBy" value="Fede" />

          <div className="flex flex-1 flex-col">
            <label className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/50">
              Contenido del Borrador
            </label>
            <textarea
              name="editedText"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={isAlreadyPublished}
              className={`w-full flex-1 resize-y rounded-md border border-ink/15 px-4 py-3 text-sm leading-relaxed text-ink focus:border-ink/40 focus:ring-1 focus:ring-ink/20 focus:outline-none ${
                isAlreadyPublished ? "bg-slate-50 cursor-not-allowed opacity-85" : "bg-white"
              }`}
              placeholder="Escribe la respuesta aquí..."
            />
          </div>

          {response.riskNotes ? (
            <details className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 transition-colors">
              <summary className="cursor-pointer font-bold text-amber-700 hover:text-amber-900 focus:outline-none">
                Ver advertencias y notas internas
              </summary>
              <p className="mt-2 leading-relaxed">{response.riskNotes}</p>
            </details>
          ) : null}

          {!isAlreadyPublished ? (
            <div className="flex items-center justify-between pt-2 border-t border-ink/5">
              <div>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-full border border-signal/20 text-signal hover:bg-signal/5 px-4 py-2.5 text-sm font-bold transition disabled:opacity-50"
                >
                  {isDeleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
              <div>
                <SubmitButton
                  loadingText={response.approvedBy ? "Actualizando…" : "Aprobando…"}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-slate-850 disabled:opacity-50"
                >
                  {response.approvedBy ? "Actualizar texto aprobado" : "Aprobar texto"}
                </SubmitButton>
              </div>
            </div>
          ) : null}
        </form>

        {response.approvedBy && canPublishViaAgent && publishViaAgentAction && !isAlreadyPublished ? (
          <form action={publishViaAgentAction} className="mt-4 rounded-md border border-brass/30 bg-brass/5 p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-brass/80 mb-3">Publicar vía agente</p>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <input type="hidden" name="responseId" value={response.id} />
            <input type="hidden" name="client" value={clientParam ?? ""} />
            <label className="grid gap-1.5 text-xs font-semibold text-slate">
              Cuenta / Voz de publicación
              <select
                name="account"
                defaultValue={suggestedAccount ?? ""}
                className="rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink"
              >
                <option value="">— Navegador personal (sin cuenta automatizada) —</option>
                {agentAccounts.map(({ name, label }) => (
                  <option key={name} value={name}>
                    {label}{name === suggestedAccount ? " (sugerida)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton
              loadingText="⏳ Publicando… (puede tardar 1-2 min)"
              className="mt-3 w-full rounded-full bg-brass px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
            >
              Publicar vía agente
            </SubmitButton>
          </form>
        ) : null}

        {response.approvedBy && !isAlreadyPublished ? (
          <form action={markAsPublishedAction} className="mt-4 rounded-md border border-moss/25 bg-moss/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-moss">Publicacion manual</p>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full border border-ink/15 bg-white/80 px-3.5 py-1 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white"
              >
                {isCopied ? "Copiado" : "Copiar texto"}
              </button>
            </div>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <input type="hidden" name="responseId" value={response.id} />
            <label className="mt-3 grid gap-1.5 text-xs font-semibold text-slate">
              URL publicada
              <input
                name="publishedUrl"
                type="url"
                placeholder="https://..."
                className="rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="grid gap-1.5 text-xs font-semibold text-slate">
                Resultado
                <select name="result" className="rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink">
                  <option value="published">Publicado</option>
                  <option value="reply_received">Respondio usuario</option>
                  <option value="whatsapp">Derivo a WhatsApp</option>
                  <option value="sale_assist">Venta asistida</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2.5 text-xs font-semibold text-slate">
                <input name="followUpNeeded" type="checkbox" className="h-4 w-4" />
                Seguimiento
              </label>
            </div>
            <SubmitButton
              loadingText="Guardando..."
              className="mt-3 w-full rounded-full bg-moss px-5 py-2.5 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
            >
              Marcar publicado
            </SubmitButton>
          </form>
        ) : null}

        {response.publishingLog ? (
          <div className="mt-4 rounded-md border border-moss/25 bg-moss/5 p-4 text-xs animate-fade-in">
            <p className="font-bold text-moss flex items-center gap-1.5">
              <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-moss text-white text-[10px]">✓</span>
              Comentario Publicado Exitosamente
            </p>
            <div className="mt-2 text-slate/75 space-y-1">
              <p><span className="font-bold text-ink">Fecha:</span> {new Date(response.publishingLog.publishedAt).toLocaleString("es-AR")}</p>
              {response.publishingLog.account ? (
                <p><span className="font-bold text-ink">Cuenta:</span> {response.publishingLog.account}</p>
              ) : null}
              {response.publishingLog.publishedBy ? (
                <p><span className="font-bold text-ink">Por:</span> {response.publishingLog.publishedBy}</p>
              ) : null}
              {response.publishingLog.result ? (
                <p><span className="font-bold text-ink">Resultado:</span> {response.publishingLog.result}</p>
              ) : null}
              {response.publishingLog.publishedUrl ? (
                <div className="pt-2">
                  <a
                    href={response.publishingLog.publishedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-moss underline hover:text-ink transition-colors"
                  >
                    Ver comentario publicado ↗
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
