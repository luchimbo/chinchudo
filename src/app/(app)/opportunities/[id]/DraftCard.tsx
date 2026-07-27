"use client";

import React, { useMemo, useState, useEffect } from "react";
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

type PersonaOption = { id: string; name: string };

type ResponseEntry = {
  id: string;
  variantType: string;
  voiceVariant?: string;
  voiceVariantReason?: string;
  draftText: string;
  editedText: string;
  riskNotes: string;
  approvedBy: string;
  personaId: string;
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

type AgentAccount = { name: string; label: string; defaultPersona?: string };

function getPersonaDisplayName(name: string, _clientSlug?: string | null) {
  return name;
}

type DraftCardProps = {
  response: ResponseEntry;
  isTopRecommendation?: boolean;
  recommendationReason?: string | null;
  opportunity: OpportunityEntry;
  clientSlug?: string | null;
  approveResponseAction: (formData: FormData) => Promise<void>;
  approveAndPublishResponseAction?: (formData: FormData) => Promise<void>;
  deleteResponseAction: (formData: FormData) => Promise<void>;
  simulateDemoPublicationAction?: (formData: FormData) => Promise<void>;
  publishViaAgentAction?: (formData: FormData) => Promise<void>;
  agentAccounts?: AgentAccount[];
  suggestedAccount?: string | null;
  canPublishViaAgent?: boolean;
  canPublishInOneStep?: boolean;
  clientParam?: string;
  isAlreadyPublished?: boolean;
  personas: PersonaOption[];
};

export function DraftCard({
  response,
  isTopRecommendation = false,
  recommendationReason,
  opportunity,
  clientSlug,
  approveResponseAction,
  approveAndPublishResponseAction,
  deleteResponseAction,
  simulateDemoPublicationAction,
  publishViaAgentAction,
  agentAccounts = [],
  suggestedAccount,
  canPublishViaAgent,
  canPublishInOneStep,
  clientParam,
  isAlreadyPublished = false,
  personas,
}: DraftCardProps) {
  const [text, setText] = useState(response.editedText || response.draftText);
  const [isCopied, setIsCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(response.personaId);

  const personaAccountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of agentAccounts) {
      if (acc.defaultPersona) map.set(acc.defaultPersona, acc.name);
    }
    return map;
  }, [agentAccounts]);

  const initialAccountForPersona = useMemo(() => {
    const persona = personas.find((p) => p.id === response.personaId);
    return persona ? personaAccountMap.get(persona.name) : undefined;
  }, [personas, response.personaId, personaAccountMap]);

  const [selectedAccount, setSelectedAccount] = useState(initialAccountForPersona ?? suggestedAccount ?? "");

  useEffect(() => {
    const persona = personas.find((p) => p.id === selectedPersonaId);
    if (persona) {
      const account = personaAccountMap.get(persona.name);
      if (account) setSelectedAccount(account);
    }
  }, [selectedPersonaId, personas, personaAccountMap]);

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

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const isOneStep = canPublishInOneStep && approveAndPublishResponseAction;
  const publishAction = isOneStep ? approveAndPublishResponseAction : approveResponseAction;

  return (
    <article className={`flex min-w-0 flex-col rounded-lg border bg-white/75 p-4 shadow-panel backdrop-blur transition-all duration-300 hover:shadow-md ${isTopRecommendation ? "border-moss/35 ring-1 ring-moss/20" : "border-ink/10"}`}>
      {/* Header */}
      <div className="flex items-center justify-end gap-2 border-b border-ink/5 pb-3">
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

      <div className="mt-3">
        <form action={publishAction} className="flex flex-col justify-between gap-3">
          <input type="hidden" name="responseId" value={response.id} />
          <input type="hidden" name="opportunityId" value={opportunity.id} />
          <input type="hidden" name="approvedBy" value="Operador" />
          {clientParam ? <input type="hidden" name="client" value={clientParam} /> : null}

          <div className="flex flex-1 flex-col">
            <label className="mb-1 text-xs font-bold uppercase tracking-wider text-slate/50">
              Respuesta sugerida
            </label>
            <textarea
              name="editedText"
              rows={6}
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={isAlreadyPublished}
              className={`w-full flex-1 resize-y rounded-md border border-ink/15 px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-ink/40 focus:ring-1 focus:ring-ink/20 focus:outline-none ${
                isAlreadyPublished ? "bg-slate-50 cursor-not-allowed opacity-85" : "bg-white"
              }`}
              placeholder="Escribe la respuesta aquí..."
            />
          </div>

          {!isAlreadyPublished && personas.length > 0 ? (
            <label className="grid gap-1.5 text-xs font-semibold text-slate">
              Voz / Persona de publicación
              <select
                name="personaId"
                value={selectedPersonaId}
                onChange={(e) => setSelectedPersonaId(e.target.value)}
                className="w-full rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink"
              >
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {getPersonaDisplayName(persona.name, clientSlug)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isOneStep && !isAlreadyPublished ? (
            <label className="grid gap-1.5 text-xs font-semibold text-slate">
              Cuenta / Voz de publicación
              <select
                name="account"
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink"
              >
                <option value="">— Elegir cuenta —</option>
                {agentAccounts.map(({ name, label }) => (
                  <option key={name} value={name}>
                    {label}{name === suggestedAccount ? " (sugerida)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isOneStep ? (
            <p className="rounded-md border border-signal/20 bg-signal/5 px-3 py-2 text-xs font-semibold text-signal">
              Atención: este botón publica el comentario directamente en {opportunity.channel.name}. Si falla, no se aprueba ni se guarda.
            </p>
          ) : null}

          {!isAlreadyPublished ? (
            <div className="flex items-center justify-between gap-2 border-t border-ink/5 pt-2">
              <div>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="rounded-full border border-signal/20 px-3 py-2 text-xs font-bold text-signal transition hover:bg-signal/5 disabled:opacity-50"
                >
                  {isDeleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
              <div>
                <SubmitButton
                  loadingText={isOneStep ? "Publicando…" : response.approvedBy ? "Actualizando…" : "Aprobando…"}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    isOneStep
                      ? "bg-brass text-white hover:bg-ink"
                      : "bg-ink text-paper hover:bg-slate-850"
                  }`}
                >
                  {isOneStep ? "Publicar comentario" : response.approvedBy ? "Actualizar respuesta aprobada" : "Aprobar respuesta"}
                </SubmitButton>
              </div>
            </div>
          ) : null}
        </form>

        {response.approvedBy && simulateDemoPublicationAction && !isAlreadyPublished ? (
          <form action={simulateDemoPublicationAction} className="mt-3">
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <input type="hidden" name="responseId" value={response.id} />
            <SubmitButton
              loadingText="Publicando demo…"
              className="w-full rounded-full bg-brass px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
            >
              Publicar comentario (demo)
            </SubmitButton>
          </form>
        ) : null}

        {response.approvedBy && canPublishViaAgent && !isOneStep && publishViaAgentAction && !isAlreadyPublished ? (
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
                className="w-full rounded-md border border-ink/15 bg-white px-3 py-2.5 text-sm text-ink"
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
