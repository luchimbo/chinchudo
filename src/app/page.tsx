import Link from "next/link";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FilterBar } from "@/components/filter-bar";
import { ClientSwitcher } from "@/components/client-switcher";
import { AutoPilotToggle } from "@/components/auto-pilot-toggle";
import { getCurrentUser, getVisibleClients } from "@/lib/auth";
import { updateOpportunityStatus } from "@/app/opportunities/actions";
import {
  intentLabels,
  opportunityStatuses,
  priorityLabels,
  statusLabels,
  type OpportunityIntentValue,
  type OpportunityPriorityValue,
  type OpportunityStatusValue
} from "@/lib/labels";

const PAGE_SIZE = 12;

const WORK_QUEUE = [
  { label: "Nuevas", status: "NEW", helper: "Entraron y todavia no se miraron." },
  { label: "A revisar", status: "NEEDS_REVIEW", helper: "Necesitan criterio humano." },
  { label: "Borradores", status: "DRAFTED", helper: "Listas para editar o aprobar." },
  { label: "Para publicar", status: "APPROVED", helper: "Texto aprobado, falta accion." },
  { label: "Seguimiento", status: "FOLLOW_UP", helper: "Hay que volver sobre la charla." }
] as const;

function getPriorityClass(priority: string) {
  if (priority === "URGENT") return "bg-signal text-white";
  if (priority === "HIGH") return "bg-brass text-white";
  if (priority === "MEDIUM") return "bg-moss text-white";
  return "bg-ink/10 text-ink";
}

function getStatusClass(status: string) {
  if (status === "PUBLISHED" || status === "CONVERTED") return "border-moss/30 bg-moss/10 text-moss";
  if (status === "FOLLOW_UP" || status === "APPROVED") return "border-brass/40 bg-brass/10 text-brass";
  if (status === "DISCARDED") return "border-ink/10 bg-ink/5 text-ink/55";
  return "border-signal/30 bg-signal/10 text-signal";
}

function getNextAction(status: string) {
  if (status === "NEW") return "Clasificar";
  if (status === "NEEDS_REVIEW") return "Resolver";
  if (status === "DRAFTED") return "Aprobar";
  if (status === "APPROVED") return "Publicar";
  if (status === "FOLLOW_UP") return "Seguir";
  return "Ver";
}

function SourceLink({ href, compact = false }: { href: string; compact?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center justify-center rounded-full border border-ink/15 font-bold text-ink transition hover:border-ink/40 hover:bg-white ${
        compact ? "h-8 px-3 text-xs" : "h-9 px-3 text-xs"
      }`}
    >
      Abrir fuente
    </a>
  );
}

const PENDING_STATUSES = ["NEW", "NEEDS_REVIEW", "DRAFTED", "APPROVED", "FOLLOW_UP"] as const;
const RESPONDED_STATUSES = ["PUBLISHED", "CONVERTED"] as const;

type PageProps = {
  searchParams: { status?: string; channel?: string; q?: string; page?: string; view?: string; client?: string };
};

export default async function HomePage({ searchParams }: PageProps) {
  const [channelsList, clients, currentUser] = await Promise.all([
    prisma.channel.findMany({ orderBy: { name: "asc" } }),
    getVisibleClients(prisma),
    getCurrentUser(),
  ]);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;

  if (!searchParams.client && clients.length > 1) {
    const clientCards = await Promise.all(clients.map(async (client) => {
      const clientWhere: Prisma.OpportunityWhereInput = {
        OR: [
          { detectedBrand: { clientId: client.id } },
          { monitoredSource: { clientId: client.id } },
        ],
      };
      const [pending, drafted, approved, sources, brands] = await Promise.all([
        prisma.opportunity.count({
          where: {
            ...clientWhere,
            status: { in: [...PENDING_STATUSES] },
          },
        }),
        prisma.opportunity.count({ where: { ...clientWhere, status: "DRAFTED" } }),
        prisma.opportunity.count({ where: { ...clientWhere, status: "APPROVED" } }),
        prisma.monitoredSource.count({ where: { clientId: client.id, active: true } }),
        prisma.brand.count({ where: { clientId: client.id } }),
      ]);
      return { client, pending, drafted, approved, sources, brands };
    }));

    return (
      <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 lg:px-8">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">Clientes</p>
            <h1 className="mt-3 max-w-4xl font-display text-5xl leading-none text-ink md:text-7xl">
              Elegi el cliente
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate">
              Cada workspace carga su propio catalogo, voces, oportunidades y reglas. El agente comparte motor, pero entra con el guion del cliente seleccionado.
            </p>
            {currentUser ? (
              <p className="mt-3 text-xs font-semibold text-slate/60">Usuario: {currentUser.label}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Link href={activeClient ? `/admin?client=${activeClient.slug}` : "/admin"} className="inline-flex h-10 items-center justify-center rounded-full border border-ink/20 bg-white/50 px-4 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
              Configuracion
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 bg-white/30 px-4 text-sm text-slate/60 transition hover:border-ink/30 hover:text-ink"
                title="Cerrar sesion"
              >
                Salir
              </button>
            </form>
          </div>
        </header>

        {clientCards.length === 0 ? (
          <section className="rounded-lg border border-brass/30 bg-brass/10 p-6 text-sm leading-6 text-ink">
            No hay clientes disponibles para este usuario. Revisar `AUTH_USERS_JSON` o la configuracion de clientes activos.
          </section>
        ) : (
          <section className="grid gap-4 md:grid-cols-2">
            {clientCards.map(({ client, pending, drafted, approved, sources, brands }) => (
              <Link
                key={client.id}
                href={`/?client=${encodeURIComponent(client.slug)}`}
                className="group relative overflow-hidden rounded-lg border border-ink/10 bg-white/75 p-6 shadow-panel backdrop-blur transition hover:-translate-y-1 hover:border-ink/30 hover:bg-white"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-moss">{client.slug}</p>
                    <h2 className="mt-3 font-display text-4xl leading-none text-ink">{client.name}</h2>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-slate">{client.description || "Workspace operativo"}</p>
                  </div>
                  <span className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold text-ink transition group-hover:bg-ink group-hover:text-paper">
                    Entrar
                  </span>
                </div>

                <div className="mt-8 grid grid-cols-4 gap-2">
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate/60">Pendientes</p>
                    <p className="mt-1 font-display text-3xl text-ink">{pending}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate/60">Borradores</p>
                    <p className="mt-1 font-display text-3xl text-ink">{drafted}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate/60">Aprobadas</p>
                    <p className="mt-1 font-display text-3xl text-ink">{approved}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate/60">Fuentes</p>
                    <p className="mt-1 font-display text-3xl text-ink">{sources}</p>
                  </div>
                </div>

                <p className="mt-4 text-xs font-semibold text-slate/60">{brands} marcas configuradas</p>
              </Link>
            ))}
          </section>
        )}
      </main>
    );
  }

  // Normalizar y validar filtros
  const view = searchParams.view === "responded" ? "responded" : searchParams.view === "pending" ? "pending" : "";
  const validStatus = opportunityStatuses.includes(searchParams.status as OpportunityStatusValue)
    ? (searchParams.status as OpportunityStatusValue)
    : "";
  const validChannel = channelsList.find((c) => c.name === searchParams.channel)?.name ?? "";
  const q = (searchParams.q ?? "").trim();
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where: Prisma.OpportunityWhereInput = {};
  if (activeClient) {
    where.OR = [
      { detectedBrand: { clientId: activeClient.id } },
      { monitoredSource: { clientId: activeClient.id } },
    ];
  }
  if (view === "pending") where.status = { in: [...PENDING_STATUSES] };
  else if (view === "responded") where.status = { in: [...RESPONDED_STATUSES] };
  // Sub-filtro de status sólo si no hay view activo
  if (!view && validStatus) where.status = validStatus;
  if (validChannel) where.channel = { name: validChannel };
  if (q) {
    const queryOr: Prisma.OpportunityWhereInput[] = [
      { sourceText: { contains: q } },
      { sourceAuthor: { contains: q } },
    ];
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: queryOr }];
  }

  const [opportunities, matchingCount, stats, brands, personas] = await Promise.all([
    prisma.opportunity.findMany({
      where,
      include: {
        channel: true,
        detectedBrand: true,
        detectedProduct: true,
        _count: { select: { responses: true } }
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.opportunity.count({ where }),
    prisma.opportunity.groupBy({
      by: ["status"],
      _count: { status: true }
    }),
    prisma.brand.findMany({ where: activeClient ? { clientId: activeClient.id } : undefined, orderBy: { name: "asc" } }),
    prisma.persona.findMany({ where: activeClient ? { clientId: activeClient.id } : undefined, orderBy: { name: "asc" } })
  ]);

  const totalPages = Math.max(1, Math.ceil(matchingCount / PAGE_SIZE));
  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (activeClient) params.set("client", activeClient.slug);
    if (view) params.set("view", view);
    if (!view && validStatus) params.set("status", validStatus);
    if (validChannel) params.set("channel", validChannel);
    if (q) params.set("q", q);
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  const statMap = new Map(stats.map((item) => [item.status, item._count.status]));
  const activeCount =
    (statMap.get("NEW") ?? 0) +
    (statMap.get("NEEDS_REVIEW") ?? 0) +
    (statMap.get("DRAFTED") ?? 0);
  const respondedCount =
    (statMap.get("PUBLISHED") ?? 0) +
    (statMap.get("CONVERTED") ?? 0);
  const pendingCount =
    (statMap.get("NEW") ?? 0) +
    (statMap.get("NEEDS_REVIEW") ?? 0) +
    (statMap.get("DRAFTED") ?? 0) +
    (statMap.get("APPROVED") ?? 0) +
    (statMap.get("FOLLOW_UP") ?? 0);
  const publishReadyCount = statMap.get("APPROVED") ?? 0;
  const followUpCount = statMap.get("FOLLOW_UP") ?? 0;
  const clientParam = activeClient ? `client=${encodeURIComponent(activeClient.slug)}` : "";
  const withClient = (href: string) => {
    if (!clientParam) return href;
    return href.includes("?") ? `${href}&${clientParam}` : `${href}?${clientParam}`;
  };

  const [urgentQueue, followUpQueue, recentSources] = await Promise.all([
    prisma.opportunity.findMany({
      where: {
        AND: [
          ...(activeClient ? [{
            OR: [
              { detectedBrand: { clientId: activeClient.id } },
              { monitoredSource: { clientId: activeClient.id } },
            ],
          }] : []),
          {
            OR: [
              { priority: "URGENT" },
              { priority: "HIGH" },
              { status: "APPROVED" },
            ],
          },
        ],
        NOT: { status: { in: ["PUBLISHED", "DISCARDED", "CONVERTED"] } }
      },
      include: { channel: true, detectedBrand: true },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 5
    }),
    prisma.opportunity.findMany({
      where: {
        status: "FOLLOW_UP",
        ...(activeClient && {
          OR: [
            { detectedBrand: { clientId: activeClient.id } },
            { monitoredSource: { clientId: activeClient.id } },
          ],
        }),
      },
      include: { channel: true, detectedBrand: true },
      orderBy: { updatedAt: "desc" },
      take: 4
    }),
    prisma.monitoredSource.findMany({
      where: { active: true, ...(activeClient ? { clientId: activeClient.id } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 4
    })
  ]);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-8 lg:px-8">
      <header className="mb-6 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.32em] text-moss">
            {activeClient?.name ?? "Sin cliente activo"}
          </p>
          {currentUser ? (
            <p className="mt-2 text-xs font-semibold text-slate/60">
              Usuario: {currentUser.label}
            </p>
          ) : null}
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-none text-ink md:text-6xl">
            Cola diaria
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate">
            {activeCount + publishReadyCount + followUpCount} conversaciones necesitan atención. Revisá, aprobá el texto y publicalo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {clients.length > 0 ? <ClientSwitcher clients={clients} activeSlug={activeClient?.slug ?? clients[0].slug} /> : null}

          <span className="h-5 w-px bg-ink/15 hidden sm:block" />

          {/* Navegación secundaria — texto plano */}
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href={`/informe${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Informe</Link>
            <Link href={`/analytics${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Analítica</Link>
            <Link href={`/landings${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Blog</Link>
            <Link href={`/leads${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Contactos</Link>
            <Link href={`/distribution${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Para publicar</Link>
            <Link href={`/geo${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">En las IAs</Link>
            <Link href={`/actividad${activeClient ? `?client=${activeClient.slug}` : ""}`} className="text-sm text-slate/70 transition hover:text-ink">Actividad</Link>
            <Link href={withClient("/admin")} className="text-sm text-slate/70 transition hover:text-ink">Configuración</Link>
            <Link href={withClient("/logins")} className="text-sm text-slate/70 transition hover:text-ink">Cuentas</Link>
          </nav>

          <span className="h-5 w-px bg-ink/15 hidden sm:block" />

          {/* Acciones primarias */}
          <div className="flex items-center gap-2">
            <Link
              href={withClient("/opportunities/new")}
              className="inline-flex h-10 items-center justify-center rounded-full bg-ink px-5 text-sm font-bold text-paper shadow-sm transition hover:-translate-y-0.5 hover:bg-slate"
            >
              Nueva oportunidad
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-full border border-ink/15 px-4 text-sm font-semibold text-slate/60 transition hover:border-ink/30 hover:text-ink"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {activeClient ? (
        <div className="mb-6">
          <AutoPilotToggle
            clientId={activeClient.id}
            initialAutoApprove={activeClient.autoApprove}
            initialAutoPublish={activeClient.autoPublish}
          />
        </div>
      ) : null}

      <section className="mb-4 flex gap-3">
        <Link
          href={withClient("/?view=pending")}
          className={`flex flex-1 flex-col rounded-lg border p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-white ${
            view === "pending" ? "border-ink bg-white" : "border-ink/10 bg-white/70"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">Pendientes</p>
          <p className="mt-2 font-display text-5xl leading-none">{pendingCount}</p>
          <p className="mt-2 text-xs leading-5 text-slate/60">Sin responder todavía</p>
        </Link>
        <Link
          href={withClient("/?view=responded")}
          className={`flex flex-1 flex-col rounded-lg border p-5 shadow-sm transition hover:-translate-y-0.5 hover:bg-white ${
            view === "responded" ? "border-moss bg-moss/5" : "border-ink/10 bg-white/70"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">Respondidas</p>
          <p className="mt-2 font-display text-5xl leading-none text-moss">{respondedCount}</p>
          <p className="mt-2 text-xs leading-5 text-slate/60">Publicadas o convertidas</p>
        </Link>
      </section>

      {view !== "responded" ? (
      <section className="mb-6 grid gap-3 md:grid-cols-5">
        {WORK_QUEUE.map((item) => {
          const count = statMap.get(item.status) ?? 0;
          const href = withClient(`/?status=${item.status}`);
          return (
            <Link
              key={item.status}
              href={href}
              className={`rounded-lg border p-4 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white ${
                validStatus === item.status
                  ? "border-ink bg-white"
                  : "border-ink/10 bg-white/70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate/70">{item.label}</p>
                {count > 0 ? <span className="h-2 w-2 rounded-full bg-signal" /> : null}
              </div>
              <p className="mt-3 font-display text-4xl leading-none">{count}</p>
              <p className="mt-2 min-h-[36px] text-xs leading-5 text-slate/70">{item.helper}</p>
            </Link>
          );
        })}
      </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
            <div>
              <h2 className="font-display text-2xl">
                {view === "responded" ? "Respondidas" : view === "pending" ? "Pendientes" : "Trabajo pendiente"}
              </h2>
              <p className="text-sm text-slate/75">
                {matchingCount} {matchingCount === 1 ? "resultado" : "resultados"}
                {totalPages > 1 ? ` · página ${page} de ${totalPages}` : ""}
              </p>
            </div>
            <div className="hidden text-right text-xs font-semibold text-slate/65 md:block">
              <p>{respondedCount} respondidas</p>
              <p>{brands.length} marcas / {personas.length} voces</p>
            </div>
          </div>

          <FilterBar channels={channelsList.map((c) => c.name)} />

          <div className="divide-y divide-ink/10">
            {opportunities.length === 0 ? (
              <div className="px-5 py-12 text-center text-slate">
                No hay oportunidades que coincidan con el filtro.
              </div>
            ) : (
              opportunities.map((opportunity) => {
                const missing = [
                  !opportunity.detectedBrand ? "marca" : "",
                  !opportunity.detectedProduct ? "producto" : ""
                ].filter(Boolean);
                const hasDraft = opportunity._count.responses > 0;
                return (
                <article key={opportunity.id} className="grid gap-4 px-5 py-4 transition hover:bg-paper/70 md:grid-cols-[120px_1fr_180px]">
                  <div>
                    <p className="text-sm font-bold text-ink">{opportunity.channel.name}</p>
                    <p className="mt-1 text-xs text-slate/70">
                      {opportunity.createdAt.toLocaleDateString("es-AR")}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-slate/60">
                      {opportunity.sourceAuthor || "autor sin cargar"}
                    </p>
                    <div className="mt-3 hidden md:block">
                      <SourceLink href={opportunity.sourceUrl} compact />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${getPriorityClass(opportunity.priority)}`}>
                        {priorityLabels[opportunity.priority as OpportunityPriorityValue]}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getStatusClass(opportunity.status)}`}>
                        {statusLabels[opportunity.status as OpportunityStatusValue]}
                      </span>
                      <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-bold text-slate">
                        {intentLabels[opportunity.detectedIntent as OpportunityIntentValue]}
                      </span>
                      {hasDraft ? (
                        <span className="rounded-full border border-moss/25 bg-moss/10 px-3 py-1 text-xs font-bold text-moss">
                          {opportunity._count.responses} borradores
                        </span>
                      ) : null}
                      {missing.length > 0 ? (
                        <span className="rounded-full border border-brass/25 bg-brass/10 px-3 py-1 text-xs font-bold text-brass">
                          Falta {missing.join(" / ")}
                        </span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-ink">{opportunity.sourceText}</p>
                    <p className="mt-2 text-xs font-semibold text-slate/75">
                      {opportunity.detectedBrand?.name ?? "Marca sin definir"}
                      {opportunity.detectedProduct ? ` / ${opportunity.detectedProduct.name}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                    <div className="md:hidden">
                      <SourceLink href={opportunity.sourceUrl} compact />
                    </div>
                    {opportunity.status === "NEW" ? (
                      <form action={updateOpportunityStatus}>
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <button name="status" value="NEEDS_REVIEW" className="h-9 rounded-full border border-ink/15 px-3 text-xs font-bold text-ink transition hover:border-ink/40 hover:bg-white">
                          Revisar luego
                        </button>
                      </form>
                    ) : null}
                    {opportunity.status !== "DISCARDED" && opportunity.status !== "PUBLISHED" && opportunity.status !== "CONVERTED" ? (
                      <form action={updateOpportunityStatus}>
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <button name="status" value="DISCARDED" className="h-9 rounded-full border border-ink/10 px-3 text-xs font-bold text-slate/65 transition hover:border-signal/30 hover:text-signal">
                          Descartar
                        </button>
                      </form>
                    ) : null}
                    <Link
                      href={`/opportunities/${opportunity.id}`}
                      className="inline-flex h-9 items-center justify-center rounded-full bg-ink px-4 text-sm font-bold text-paper transition hover:bg-slate"
                    >
                      {getNextAction(opportunity.status)}
                    </Link>
                  </div>
                </article>
              );
              })
            )}
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-ink/10 px-5 py-4">
              {page > 1 ? (
                <Link
                  href={buildPageHref(page - 1)}
                  className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="inline-flex h-9 items-center rounded-full border border-ink/5 px-4 text-sm font-bold text-ink/30">
                  ← Anterior
                </span>
              )}

              <span className="text-xs font-semibold text-slate/70">
                Página {page} de {totalPages}
              </span>

              {page < totalPages ? (
                <Link
                  href={buildPageHref(page + 1)}
                  className="inline-flex h-9 items-center rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
                >
                  Siguiente →
                </Link>
              ) : (
                <span className="inline-flex h-9 items-center rounded-full border border-ink/5 px-4 text-sm font-bold text-ink/30">
                  Siguiente →
                </span>
              )}
            </div>
          ) : null}
        </div>

        <aside className="grid content-start gap-4">
          <div className="rounded-lg border border-ink/10 bg-ink p-5 text-paper shadow-panel">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-paper/60">Orden sugerido</p>
            <h2 className="mt-3 font-display text-3xl">Publicar lo aprobado</h2>
            <p className="mt-3 text-sm leading-6 text-paper/75">
              Hay {publishReadyCount} respuestas aprobadas esperando salir. Despues conviene limpiar nuevas y dejar follow-ups marcados.
            </p>
            <Link href={withClient("/?status=APPROVED")} className="mt-4 inline-flex h-10 items-center rounded-full bg-paper px-4 text-sm font-bold text-ink transition hover:bg-white">
              Ver aprobadas
            </Link>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate/70">Urgentes</p>
            <div className="mt-4 grid gap-3">
              {urgentQueue.length === 0 ? (
                <p className="rounded-md bg-paper p-3 text-sm text-slate/70">No hay urgentes ni aprobadas pendientes.</p>
              ) : urgentQueue.map((item) => (
                <div key={item.id} className="rounded-md border border-ink/10 bg-paper p-3 transition hover:border-ink/30 hover:bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate/65">{item.channel.name}</p>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${getPriorityClass(item.priority)}`}>
                      {priorityLabels[item.priority as OpportunityPriorityValue]}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-ink">{item.sourceText}</p>
                  <p className="mt-2 text-xs font-semibold text-slate/70">{item.detectedBrand?.name ?? "Sin marca"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/opportunities/${item.id}`} className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-xs font-bold text-paper transition hover:bg-slate">
                      Ver ficha
                    </Link>
                    <SourceLink href={item.sourceUrl} compact />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate/70">Seguimientos</p>
            <div className="mt-4 grid gap-3">
              {followUpQueue.length === 0 ? (
                <p className="rounded-md bg-paper p-3 text-sm text-slate/70">Sin conversaciones marcadas para volver.</p>
              ) : followUpQueue.map((item) => (
                <div key={item.id} className="rounded-md border border-ink/10 bg-paper p-3 transition hover:border-brass/40 hover:bg-white">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-brass">{item.channel.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-ink">{item.sourceText}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/opportunities/${item.id}`} className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-xs font-bold text-paper transition hover:bg-slate">
                      Ver ficha
                    </Link>
                    <SourceLink href={item.sourceUrl} compact />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white/70 p-5 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate/70">Monitoreo</p>
              <Link href="/monitoring" className="text-xs font-bold text-ink underline-offset-4 hover:underline">Configurar</Link>
            </div>
            <div className="mt-4 grid gap-2">
              {recentSources.length === 0 ? (
                <p className="rounded-md bg-paper p-3 text-sm text-slate/70">No hay fuentes activas.</p>
              ) : recentSources.map((source) => (
                <div key={source.id} className="rounded-md bg-paper p-3">
                  <p className="text-sm font-bold text-ink">{source.label}</p>
                  <p className="mt-1 text-xs text-slate/70">{source.channel} · {source.lastCount} ultimas detecciones</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
