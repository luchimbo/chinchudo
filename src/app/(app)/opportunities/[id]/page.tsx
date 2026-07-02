import { readFileSync } from "fs";
import { join } from "path";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  approveResponse,
  generateResponseDrafts,
  markAsPublished,
  publishViaAgent,
  updateOpportunityStatus,
  deleteResponse
} from "../actions";
import { prisma } from "@/lib/db";
import { StatusBanner } from "./StatusBanner";
import {
  statusLabels,
  type OpportunityStatusValue
} from "@/lib/labels";
import { suggestAllPersonasForClient } from "@/lib/persona-router";
import { resolveOpportunityClient } from "@/lib/client-context";
import { selectRelevantProducts } from "@/lib/catalog";
import { CopyButton } from "./CopyButton";
import { SubmitButton } from "./SubmitButton";
import { DraftCard } from "./DraftCard";
import { BrowserPreview } from "./BrowserPreview";

type PageProps = {
  params: { id: string };
  searchParams?: { agentError?: string; agentOk?: string; agentPending?: string; client?: string };
};

function statusClass(status: string) {
  if (status === "PUBLISHED" || status === "CONVERTED") return "bg-moss text-white";
  if (status === "APPROVED" || status === "FOLLOW_UP") return "bg-brass text-white";
  if (status === "DISCARDED") return "bg-ink/20 text-ink";
  return "bg-signal text-white";
}

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
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: params.id },
    include: {
      channel: true,
      detectedBrand: { include: { client: true } },
      detectedProduct: true,
      monitoredSource: { include: { client: true } },
      responses: {
        include: {
          persona: true,
          brand: true,
          publishingLog: true
        },
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!opportunity) {
    notFound();
  }

  const resolution = await resolveOpportunityClient(prisma, opportunity);
  const [personas, brands, products] = await Promise.all([
    prisma.persona.findMany({ where: { clientId: resolution.client.id }, orderBy: { name: "asc" } }),
    prisma.brand.findMany({ where: { clientId: resolution.client.id }, orderBy: { name: "asc" } }),
    prisma.product.findMany({
      where: { brand: { clientId: resolution.client.id } },
      include: { brand: true },
      orderBy: [{ brand: { name: "asc" } }, { name: "asc" }]
    })
  ]);

  const selectedBrandId = opportunity.detectedBrandId ?? brands[0]?.id ?? "";
  const selectedBrand = brands.find((brand) => brand.id === selectedBrandId);
  const brandProducts = products.filter((product) => product.brandId === selectedBrandId);
  const recommendedProducts = selectRelevantProducts(opportunity.sourceText, opportunity.detectedProduct, 5, {
    catalogProducts: brandProducts,
    scoped: true,
  });
  const suggestedProductId = opportunity.detectedProductId ?? recommendedProducts[0]?.id ?? brandProducts[0]?.id ?? "";
  const recommendedIds = new Set(recommendedProducts.map((product) => product.id));
  const productOptions = [
    ...recommendedProducts,
    ...brandProducts
      .filter((product) => !recommendedIds.has(product.id))
      .map((product) => ({
        id: product.id,
        nombre: product.name,
        marca: product.brand?.name ?? selectedBrand?.name ?? "",
        modelo: product.name,
        categoria_id: product.category,
        url: "",
        uso: product.useCases || product.description,
      })),
  ];
  const approvedResponse = opportunity.responses.find((response) => response.approvedBy);
  const suggestions = await suggestAllPersonasForClient(prisma, opportunity, resolution.client.id);
  const suggestion = suggestions[0];
  const suggestedPersona = personas.find((p) => p.name === suggestion?.personaName);
  const suggestedPersonaId = suggestedPersona?.id ?? personas[0]?.id ?? "";
  const channelLower = opportunity.channel.name.toLowerCase();
  type AccountEntry = { label: string; allowedChannels: string[]; defaultPersona?: string; clientSlug?: string };
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
        .filter(([, cfg]) => {
          const chanMatch = cfg.allowedChannels.includes(channelLower);
          const clientMatch = !cfg.clientSlug || cfg.clientSlug === resolution.client.slug;
          return chanMatch && clientMatch;
        })
        .map(([name, cfg]) => ({ name, label: cfg.label, defaultPersona: cfg.defaultPersona ?? "" }));
    }
  } catch {
    // accounts no disponible — publicacion via agente deshabilitada
  }
  const canPublishViaAgent = (channelLower === "youtube" || channelLower === "reddit" || channelLower === "x" || channelLower === "facebook" || channelLower === "instagram") && agentAccounts.length > 0;

  // Cuenta sugerida: la que tiene como defaultPersona el arquetipo de la respuesta aprobada (si existe) o el sugerido originalmente
  const activePersonaName = approvedResponse ? approvedResponse.persona.name : (suggestion?.personaName ?? "");
  const suggestedAccount = agentAccounts.find((a) => a.defaultPersona === activePersonaName);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-5 py-8 lg:px-8">
      <StatusBanner
        agentError={searchParams?.agentError}
        agentOk={searchParams?.agentOk}
        agentPending={searchParams?.agentPending}
        opportunityId={params.id}
        agentErrorMessages={agentErrorMessages}
        clientSlug={searchParams?.client}
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
          href={searchParams?.client ? `/oportunidades?client=${searchParams.client}` : "/oportunidades"}
          className="rounded-full border border-ink/20 bg-white/60 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white"
        >
          ← Oportunidades
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
            <div className="mt-4 grid gap-5">
              {opportunity.responses.length === 0 ? (
                <p className="rounded-md bg-paper p-4 text-sm text-slate">
                  Todavia no hay respuestas generadas para esta oportunidad.
                </p>
              ) : (
                opportunity.responses.map((response) => (
                  <DraftCard
                    key={response.id}
                    response={response}
                    opportunity={opportunity}
                    clientSlug={resolution.client.slug}
                    approveResponseAction={approveResponse}
                    deleteResponseAction={deleteResponse}
                    markAsPublishedAction={markAsPublished}
                    publishViaAgentAction={publishViaAgent}
                    agentAccounts={agentAccounts}
                    suggestedAccount={suggestedAccount?.name ?? null}
                    canPublishViaAgent={canPublishViaAgent}
                    clientParam={searchParams?.client ?? ""}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="grid content-start gap-4">
          <BrowserPreview
            sourceUrl={opportunity.sourceUrl}
            sourceAuthor={opportunity.sourceAuthor}
            sourceText={opportunity.sourceText}
            channelName={opportunity.channel.name}
            brandName={opportunity.detectedBrand?.name ?? brands[0]?.name ?? ""}
            brandBg={
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("midiplus") ? "bg-moss" :
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("kressmer") ? "bg-brass" :
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("prestige") ? "bg-ink" : "bg-slate-700"
            }
            brandText={
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("prestige") ? "text-paper" : "text-white"
            }
            brandLabel={
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("midiplus") ? "MidiPlus" :
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("kressmer") ? "Kressmer" :
              (opportunity.detectedBrand?.name ?? "").toLowerCase().includes("prestige") ? "Prestige" :
              (opportunity.detectedBrand?.name ?? brands[0]?.name ?? "XX").slice(0, 2)
            }
            approvedText={approvedResponse?.editedText || approvedResponse?.draftText}
          />
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
              Producto
              <select name="productId" defaultValue={suggestedProductId} className="rounded-md border border-white/15 bg-paper px-3 py-3 text-ink">
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nombre}{product.id === recommendedProducts[0]?.id ? " (mejor match)" : recommendedIds.has(product.id) ? " (alternativa)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {recommendedProducts.length > 0 ? (
              <p className="mt-2 rounded-md bg-white/10 px-3 py-2 text-xs leading-5 text-paper/70">
                <span className="font-bold text-paper">Auto:</span> {recommendedProducts[0].nombre}
                {recommendedProducts.length > 1 ? <span className="text-paper/55">. Alternativas reales disponibles en el selector.</span> : null}
              </p>
            ) : null}
            <label className="mt-4 grid gap-2 text-sm font-semibold text-paper/80">
              Voz
              <select name="personaId" defaultValue={suggestedPersonaId} className="rounded-md border border-white/15 bg-paper px-3 py-3 text-ink">
                {personas.map((persona) => (
                  <option key={persona.id} value={persona.id}>
                    {getPersonaDisplayName(persona.name, resolution.client.slug)}{persona.id === suggestedPersonaId ? " (sugerida)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {suggestedPersona ? (
              <p className="mt-2 rounded-md bg-white/10 px-3 py-2 text-xs leading-5 text-paper/70">
                <span className="font-bold text-paper">Sugerencia automática:</span> {getPersonaDisplayName(suggestion.personaName, resolution.client.slug)}
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
            <form id="publish-section" className="rounded-lg border border-ink/10 bg-white/75 p-5 shadow-panel backdrop-blur" action={markAsPublished}>
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
                loadingText="Guardando..."
                className="mt-3 w-full rounded-full bg-moss px-5 py-3 text-sm font-bold text-white transition hover:bg-ink disabled:opacity-50"
              >
                Marcar publicado
              </SubmitButton>
            </form>
          ) : null}

        </aside>
      </section>
    </div>
  );
}

