import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveResponse,
  generateResponseDrafts,
  markAsPublished,
  publishViaAgent,
  updateOpportunityStatus
} from "../actions";
import { prisma } from "@/lib/db";
import { StatusBanner } from "./StatusBanner";
import {
  statusLabels,
  type OpportunityStatusValue
} from "@/lib/labels";
import { suggestPersona } from "@/lib/persona-router";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./SubmitButton";

type PageProps = {
  params: { id: string };
  searchParams?: { agentError?: string; agentOk?: string; agentPending?: string };
};

function statusClass(status: string) {
  if (status === "PUBLISHED" || status === "CONVERTED") return "bg-moss text-white";
  if (status === "APPROVED" || status === "FOLLOW_UP") return "bg-brass text-white";
  if (status === "DISCARDED") return "bg-ink/20 text-ink";
  return "bg-signal text-white";
}

const agentErrorMessages: Record<string, string> = {
  no_comment_box: "No se encontró el cuadro de comentario. Asegurate de que YouTube esté logueado en el perfil y que los comentarios estén habilitados en ese video.",
  no_input_box: "No se pudo activar el campo de texto del comentario.",
  no_submit_button: "Se escribió el comentario pero no se encontró el botón de enviar.",
  no_reply_button: "Se encontró el comentario pero no el botón Responder.",
  no_reply_input: "Se abrió el diálogo de respuesta pero no apareció el campo de texto.",
  no_reply_submit: "Se escribió la respuesta pero no se encontró el botón de enviar.",
  comment_not_found: "No se encontró el comentario específico en la página (cayó en top-level como fallback).",
  not_logged_in: "El perfil no está logueado en la plataforma.",
  dolphin_not_running: "No se pudo iniciar el perfil. Asegurate de que NSTBrowser esté abierto.",
  relay_fetch_failed: "No se pudo conectar al servidor relay local. Asegurate de que el relay y el Cloudflare Tunnel estén corriendo en la PC principal.",
  publish_failed: "El agente falló al intentar publicar. Revisá los logs del servidor.",
  rate_limited_spacing: "Esta cuenta publicó hace menos de 10 minutos. Esperá un momento antes de reintentar.",
  rate_limited_daily: "Esta cuenta alcanzó el límite diario de publicaciones (8). Usá otra cuenta o intentá mañana.",
  unknown: "Error desconocido. Revisá los logs del servidor.",
};

export default async function OpportunityDetailPage({ params, searchParams }: PageProps) {
  const [opportunity, personas, brands] = await Promise.all([
    prisma.opportunity.findUnique({
      where: { id: params.id },
      include: {
        channel: true,
        detectedBrand: true,
        detectedProduct: true,
        responses: {
          include: {
            persona: true,
            brand: true,
            publishingLog: true
          },
          orderBy: { createdAt: "desc" }
        }
      }
    }),
    prisma.persona.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } })
  ]);

  if (!opportunity) {
    notFound();
  }

  const selectedBrandId = opportunity.detectedBrandId ?? brands[0]?.id ?? "";
  const approvedResponse = opportunity.responses.find((response) => response.approvedBy);

  // Sugerir arquetipo según el contexto del comentario
  const suggestion = suggestPersona(opportunity);
  const suggestedPersona = personas.find((p) => p.name === suggestion.personaName);
  const suggestedPersonaId = suggestedPersona?.id ?? personas[0]?.id ?? "";

  const channelLower = opportunity.channel.name.toLowerCase();
  type AccountEntry = { label: string; allowedChannels: string[]; defaultPersona?: string };
  let agentAccounts: { name: string; label: string; defaultPersona: string }[] = [];
  try {
    let raw: Record<string, AccountEntry> | null = null;
    // Tier 1: filesystem (dev local)
    try {
      raw = JSON.parse(readFileSync(join(process.cwd(), "agents/accounts.json"), "utf-8"));
    } catch {
      // no disponible en Vercel
    }
    // Tier 2: env var ACCOUNTS_JSON (deploy en Vercel)
    if (!raw && process.env.ACCOUNTS_JSON) {
      raw = JSON.parse(process.env.ACCOUNTS_JSON);
    }
    if (raw) {
      agentAccounts = Object.entries(raw)
        .filter(([, cfg]) => cfg.allowedChannels.includes(channelLower))
        .map(([name, cfg]) => ({ name, label: cfg.label, defaultPersona: cfg.defaultPersona ?? "" }));
    }
  } catch {
    // accounts no disponible — publicacion via agente deshabilitada
  }
  const canPublishViaAgent = (channelLower === "youtube" || channelLower === "reddit" || channelLower === "x" || channelLower === "facebook" || channelLower === "instagram") && agentAccounts.length > 0;

  // Cuenta sugerida: la que tiene como defaultPersona el arquetipo sugerido y está habilitada para este canal
  const suggestedAccount = agentAccounts.find((a) => a.defaultPersona === suggestion.personaName);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-8 lg:px-8">
      <StatusBanner
        agentError={searchParams?.agentError}
        agentOk={searchParams?.agentOk}
        agentPending={searchParams?.agentPending}
        opportunityId={params.id}
        agentErrorMessages={agentErrorMessages}
      />

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">
            Revision de oportunidad
          </p>
          <h1 className="mt-2 font-display text-4xl text-ink md:text-5xl">
            {opportunity.channel.name} / {opportunity.sourceAuthor || "autor sin cargar"}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusClass(opportunity.status)}`}>
              {statusLabels[opportunity.status as OpportunityStatusValue]}
            </span>
            <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-bold text-ink">
              {opportunity.detectedBrand?.name ?? "Marca sin definir"}
            </span>
            {opportunity.detectedProduct ? (
              <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-bold text-ink">
                {opportunity.detectedProduct.name}
              </span>
            ) : null}
          </div>
        </div>

        <Link
          href="/"
          className="rounded-full border border-ink/20 bg-white/60 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white"
        >
          Volver
        </Link>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <article className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl">Comentario original</h2>
              <a
                href={opportunity.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-ink/15 px-4 py-2 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
              >
                Abrir fuente
              </a>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-ink">
              {opportunity.sourceText}
            </p>
            {opportunity.notes ? (
              <p className="mt-4 rounded-md bg-paper p-3 text-sm leading-6 text-slate">
                {opportunity.notes}
              </p>
            ) : null}
          </article>

          <section className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur">
            <h2 className="font-display text-2xl">Borradores</h2>
            <div className="mt-4 grid gap-4">
              {opportunity.responses.length === 0 ? (
                <p className="rounded-md bg-paper p-4 text-sm text-slate">
                  Todavia no hay respuestas generadas para esta oportunidad.
                </p>
              ) : (
                opportunity.responses.map((response) => (
                  <article key={response.id} className="rounded-md border border-ink/10 bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate/70">
                          {response.variantType} / {response.persona.name}
                        </p>
                        <p className="mt-1 text-sm font-bold text-ink">{response.brand.name}</p>
                      </div>
                      {response.approvedBy ? (
                        <span className="rounded-full bg-moss px-3 py-1 text-xs font-bold text-white">
                          Aprobada
                        </span>
                      ) : null}
                    </div>

                    <form action={approveResponse} className="mt-3 grid gap-3">
                      <input type="hidden" name="responseId" value={response.id} />
                      <input type="hidden" name="opportunityId" value={opportunity.id} />
                      <textarea
                        name="editedText"
                        rows={5}
                        defaultValue={response.editedText || response.draftText}
                        className="w-full resize-y rounded-md border border-ink/15 bg-white px-3 py-3 text-sm leading-6 text-ink"
                      />
                      <p className="text-xs leading-5 text-slate/75">{response.riskNotes}</p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <input type="hidden" name="approvedBy" value="Fede" />
                        <SubmitButton
                          loadingText="Aprobando…"
                          className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper transition hover:bg-slate disabled:opacity-50"
                        >
                          Aprobar texto
                        </SubmitButton>
                      </div>
                    </form>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <form
            action={generateResponseDrafts}
            className="rounded-lg border border-ink/10 bg-ink p-5 text-paper shadow-panel"
          >
            <h2 className="font-display text-3xl">Generar respuestas</h2>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <label className="mt-4 grid gap-2 text-sm font-semibold text-paper/80">
              Marca
              <select name="brandId" defaultValue={selectedBrandId} className="rounded-md border border-white/15 bg-paper px-3 py-3 text-ink">
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold text-paper/80">
              Voz
              <select name="personaId" defaultValue={suggestedPersonaId} className="rounded-md border border-white/15 bg-paper px-3 py-3 text-ink">
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {persona.name}{persona.id === suggestedPersonaId ? " (sugerida)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {suggestedPersona ? (
              <p className="mt-2 rounded-md bg-white/10 px-3 py-2 text-xs leading-5 text-paper/70">
                <span className="font-bold text-paper">Sugerencia automática:</span> {suggestion.personaName}
                {suggestion.reason ? <span className="text-paper/55"> — {suggestion.reason}</span> : null}
              </p>
            ) : null}
            <SubmitButton
              loadingText="Generando…"
              className="mt-5 w-full rounded-full bg-paper px-5 py-3 text-sm font-bold text-ink transition hover:bg-white disabled:opacity-50"
            >
              Generar 3 variantes
            </SubmitButton>
          </form>

          {approvedResponse ? (
            <form className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur" action={markAsPublished}>
              <h2 className="font-display text-2xl">Publicacion</h2>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="responseId" value={approvedResponse.id} />
              <label className="mt-4 grid gap-2 text-sm font-semibold text-slate">
                URL publicada
                <input name="publishedUrl" type="url" placeholder="https://..." className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink" />
              </label>
              <label className="mt-4 grid gap-2 text-sm font-semibold text-slate">
                Resultado
                <select name="result" className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
                  <option value="published">Publicado</option>
                  <option value="reply_received">Respondio usuario</option>
                  <option value="whatsapp">Derivo a WhatsApp</option>
                  <option value="sale_assist">Venta asistida</option>
                </select>
              </label>
              <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate">
                <input name="followUpNeeded" type="checkbox" className="h-4 w-4" />
                Necesita seguimiento
              </label>
              <CopyButton text={approvedResponse.editedText || approvedResponse.draftText} className="mt-3 w-full rounded-full border border-ink/20 bg-paper px-5 py-3 text-sm font-bold text-ink transition hover:border-ink/45 hover:bg-white" />
              <SubmitButton
                loadingText="Guardando…"
                className="mt-3 w-full rounded-full bg-moss px-5 py-3 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
              >
                Marcar publicado
              </SubmitButton>
            </form>
          ) : null}

          {approvedResponse && canPublishViaAgent ? (
            <form className="rounded-lg border border-brass/30 bg-white/75 p-5 shadow-panel backdrop-blur" action={publishViaAgent}>
              <h2 className="font-display text-2xl">Publicar con agente</h2>
              <p className="mt-1 text-xs text-slate/70">
                El agente abre el navegador y publica el texto aprobado directamente en {opportunity.channel.name}.
              </p>
              <input type="hidden" name="opportunityId" value={opportunity.id} />
              <input type="hidden" name="responseId" value={approvedResponse.id} />
              <label className="mt-4 grid gap-2 text-sm font-semibold text-slate">
                Cuenta
                <select name="account" defaultValue={suggestedAccount?.name ?? ""} className="rounded-md border border-ink/15 bg-paper px-3 py-3 text-ink">
                  <option value="">— Navegador personal —</option>
                  {agentAccounts.map(({ name, label }) => (
                    <option key={name} value={name}>
                      {label}{name === suggestedAccount?.name ? " (sugerida)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {suggestedAccount ? (
                <p className="mt-2 text-xs leading-5 text-slate/70">
                  Cuenta sugerida para la voz <span className="font-bold text-ink">{suggestion.personaName}</span>.
                </p>
              ) : null}
              {(searchParams?.agentPending || searchParams?.agentOk || searchParams?.agentError) && (
                <div className="mt-4">
                  <StatusBanner
                    agentError={searchParams?.agentError}
                    agentOk={searchParams?.agentOk}
                    agentPending={searchParams?.agentPending}
                    opportunityId={params.id}
                    agentErrorMessages={agentErrorMessages}
                  />
                </div>
              )}
              <SubmitButton
                loadingText="⏳ Publicando… (puede tardar 1-2 min)"
                className="mt-5 w-full rounded-full bg-brass px-5 py-3 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
              >
                Publicar vía agente
              </SubmitButton>
            </form>
          ) : null}

          <form className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur" action={updateOpportunityStatus}>
            <h2 className="font-display text-2xl">Estado rapido</h2>
            <input type="hidden" name="opportunityId" value={opportunity.id} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <SubmitButton name="status" value="NEEDS_REVIEW" loadingText="Guardando…" className="rounded-full border border-ink/15 px-3 py-2 text-sm font-bold text-ink hover:bg-paper disabled:opacity-50">
                Revisar
              </SubmitButton>
              <SubmitButton name="status" value="DISCARDED" loadingText="Guardando…" className="rounded-full border border-ink/15 px-3 py-2 text-sm font-bold text-ink hover:bg-paper disabled:opacity-50">
                Descartar
              </SubmitButton>
              <SubmitButton name="status" value="FOLLOW_UP" loadingText="Guardando…" className="rounded-full border border-ink/15 px-3 py-2 text-sm font-bold text-ink hover:bg-paper disabled:opacity-50">
                Seguimiento
              </SubmitButton>
              <SubmitButton name="status" value="CONVERTED" loadingText="Guardando…" className="rounded-full border border-ink/15 px-3 py-2 text-sm font-bold text-ink hover:bg-paper disabled:opacity-50">
                Convertida
              </SubmitButton>
            </div>
          </form>
        </aside>
      </section>
    </main>
  );
}
