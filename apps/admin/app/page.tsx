import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { loadDashboard } from "@/lib/dashboard-data";
import { TASK_LABELS, supportState, taskTone, auditActionLabel } from "@/lib/dashboard-model";
import { ClientStateButton, RevokeButton, SupportAccess } from "./controls";
import { LogoutForm } from "./pending-button";
import { Badge, Timestamp, SectionHeading } from "./dashboard-ui";
import { ReportList } from "./report-list";

export const dynamic = "force-dynamic";
const number = (value: number) => value.toLocaleString("es-AR");
type Params = { q?: string; state?: string; client?: string };

export default async function DashboardPage({ searchParams = {} }: { searchParams?: Params }) {
  const identity = await requirePlatformAdmin();
  if (!identity) redirect("/login");
  const dashboard = await loadDashboard(prisma);
  const selected = dashboard.clients.find(client => client.id === searchParams.client);
  const scope = selected ? { clientId: selected.id } : {};
  const [users, sessions, audits, reports] = await Promise.all([
    prisma.user.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true, email: true, role: true, client: { select: { name: true } } } }),
    prisma.supportSession.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, reason: true, revokedAt: true, endedAt: true, exchangedAt: true, expiresAt: true, client: { select: { name: true } }, platformAdmin: { select: { name: true } } } }),
    prisma.adminAuditEvent.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, action: true, actor: { select: { name: true } }, client: { select: { name: true } } } }),
    prisma.issueReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const state = searchParams.state === "active" || searchParams.state === "suspended" ? searchParams.state : "all";
  const query = (searchParams.q || "").trim().toLocaleLowerCase("es-AR");
  const clients = dashboard.clients.filter(client =>
    (!selected || client.id === selected.id) &&
    (!query || `${client.name} ${client.slug}`.toLocaleLowerCase("es-AR").includes(query)) &&
    (state === "active" ? client.active : state === "suspended" ? !client.active : true)
  );
  const todayCount = dashboard.clients.reduce((total, client) => total + client.todayOpportunities, 0);
  const opportunityCount = dashboard.clients.reduce((total, client) => total + client._count.opportunities, 0);
  const articleCount = dashboard.clients.reduce((total, client) => total + client._count.landings, 0);
  const refreshParams = new URLSearchParams();
  for (const key of ["q", "client"] as const) {
    if (searchParams[key]) refreshParams.set(key, searchParams[key]!);
  }
  if (state !== "all") refreshParams.set("state", state);
  const refreshUrl = refreshParams.size ? `/?${refreshParams}` : "/";

  return <main className="shell dashboard">
    <header className="dashboard-header">
      <div><p className="eyebrow">Los 5 Apóstoles</p><h1>Resumen del <i>negocio</i></h1><p className="intro sans">Mirá las oportunidades encontradas y el contenido registrado para cada cliente.</p></div>
      <div className="admin-identity sans"><strong>{identity.profile.name}</strong><p>Datos al <Timestamp date={dashboard.now} /></p><div className="header-actions"><a className="button secondary" href={refreshUrl}>Actualizar datos</a><LogoutForm /></div></div>
    </header>
    <nav className="dashboard-nav sans" aria-label="Secciones del backoffice"><a href="#clientes">Actividad por cliente</a><Link href="/reportes">Problemas <span>{number(dashboard.totals.openReports)}</span></Link><a href="#administracion">Administración y detalles</a></nav>
    <section className="stats-grid" aria-label="Resumen de toda la plataforma">
      {[
        ["Clientes activos", dashboard.clients.filter(client => client.active).length, `${dashboard.clients.length} clientes registrados`],
        ["Encontradas hoy", todayCount, "Oportunidades de consulta o venta en redes"],
        ["Encontradas en total", opportunityCount, "Todas las oportunidades registradas"],
        ["Artículos registrados", articleCount, "Contenido guardado para los clientes"],
      ].map(([label, value, note]) => <article className="stat" key={label}><p className="eyebrow">{label}</p><p className="stat-value">{number(Number(value))}</p><p className="sans muted">{note}</p></article>)}
    </section>

    <section id="clientes" className="dashboard-section">
      <SectionHeading index="01" title="Actividad por cliente" description="Oportunidades, artículos y contactos registrados por el sistema. El resumen de arriba siempre incluye a todos los clientes." />
      <form className="dashboard-filters sans" method="GET">
        <label><span>Buscar cliente</span><input name="q" className="field" defaultValue={searchParams.q || ""} placeholder="Nombre del cliente" type="search" /></label>
        <label><span>Mostrar</span><select className="field" name="state" defaultValue={state}><option value="all">Todos</option><option value="active">Activos</option><option value="suspended">Suspendidos</option></select></label>
        <label><span>Cliente</span><select className="field" name="client" defaultValue={selected?.id || ""}><option value="">Todos los clientes</option>{dashboard.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <button className="button" type="submit">Ver resultados</button><Link className="reset-link" href="/">Ver todos</Link>
      </form>
      <p className="sans muted results-note">{clients.length} de {dashboard.clients.length} clientes · Hoy se cuenta desde las 00:00, hora de Argentina</p>
      <div className="client-grid">{clients.map(client => <article key={client.id} className="card client-card">
        <div className="client-heading"><h3>{client.name}</h3><Badge tone={client.active ? "ok" : "neutral"}>{client.active ? "Activo" : "Suspendido"}</Badge></div>
        <p className="sans muted client-description">{client.description || "Sin descripción del negocio."}</p>
        <dl className="client-metrics sans">{[
          ["Oportunidades encontradas", client._count.opportunities], ["Encontradas hoy", client.todayOpportunities],
          ["Artículos registrados", client._count.landings], ["Contactos registrados", client._count.leads],
        ].map(([label, value]) => <div key={label}><dd>{number(Number(value))}</dd><dt>{label}</dt></div>)}</dl>
        <p className="metric-help sans muted">Las oportunidades son consultas o posibles ventas detectadas. Los contactos registrados no indican ventas confirmadas.</p>
        <div className="client-activity sans"><span>Última actividad guardada</span><strong><Timestamp date={client.lastActivityAt} /></strong></div>
        <details className="client-config sans"><summary>Ver más datos y configuración</summary><dl>
          <div><dt>Oportunidades registradas en total</dt><dd>{number(client._count.opportunities)}</dd></div>
          <div><dt>Artículos registrados en total</dt><dd>{number(client._count.landings)}</dd></div>
          <div><dt>Tendencias / guiones de video</dt><dd>{number(client._count.trends)} / {number(client._count.videoScripts)}</dd></div>
          <div><dt>Mediciones de visibilidad en inteligencia artificial</dt><dd>{number(client._count.aiPresenceResults)}</dd></div>
          <div><dt>Usuarios del cliente</dt><dd>{number(client._count.users)}</dd></div>
          <div><dt>Marcas / estilos de respuesta</dt><dd>{client._count.brands} / {client._count.personas}</dd></div>
          <div><dt>Redes y sitios monitoreados</dt><dd>{client._count.monitoredSources}</dd></div>
          <div><dt>Aprobación / publicación automática</dt><dd>{client.autoApprove ? "Activada" : "Desactivada"} / {client.autoPublish ? "Activada" : "Desactivada"}</dd></div>
          <div><dt>Sitio del negocio</dt><dd>{client.storeUrl || "Sin configurar"}</dd></div><div><dt>Blog</dt><dd>{client.blogBaseUrl || "Sin configurar"}</dd></div>
        </dl><ClientStateButton id={client.id} active={client.active} /></details>
        <div className="client-actions">{client.active ? <SupportAccess clientId={client.id} clientName={client.name} /> : <p className="sans muted">Activá el cliente desde su configuración para abrir el panel.</p>}</div>
      </article>)}</div>
      {!clients.length ? <p className="empty-state sans">No hay clientes con estos filtros. Elegí Ver todos para volver a la lista completa.</p> : null}
    </section>

    <section id="reportes" className="dashboard-section"><SectionHeading index="02" title="Problemas informados por el equipo" description="Últimos 8 problemas abiertos. Se muestran los de toda la plataforma, aunque filtres por cliente." action={<Link href="/reportes" className="button secondary">Ver todos los problemas</Link>} /><ReportList reports={reports} /></section>

    <details id="administracion" className="advanced-section"><summary><span>Administración y detalles</span><span className="advanced-hint">Procesos, usuarios e historial de cambios</span></summary><div className="advanced-content">
    <section id="operacion" className="dashboard-section"><SectionHeading index="03" title="Detalle del trabajo automático" description="Último estado guardado de las búsquedas, respuestas y artículos. Una búsqueda que funciona pero no encuentra resultados no cuenta como un fallo." />
      <div className="card table-scroll"><table><caption className="sr-only">Estado de tareas por cliente</caption><thead><tr><th>Cliente</th><th>Búsqueda en redes</th><th>Preparación de respuestas</th><th>Publicación del blog</th><th>Actualización de productos</th><th>Análisis del negocio</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}>
        <td><strong>{client.name}</strong></td><td><p>{client._count.monitoredSources} búsquedas o sitios configurados</p><p className={client.sourceErrors ? "error-text" : "muted"}>{client.sourceErrors ? `${client.sourceErrors} búsquedas no se pudieron completar` : "Sin fallos registrados"}</p><small><Timestamp date={client.lastListenAt} /></small></td>
        <td><p>{client.draft.queued} esperando · {client.draft.processing} preparándose</p><p className={client.draft.failed ? "error-text" : "muted"}>{client.draft.failed} no se pudieron preparar</p><small><Timestamp date={client.draft.updatedAt} /></small></td>
        <td><p>{client.blog.planned} planificados · {client.blog.ready} listos</p><p>{client.blog.publishing} publicándose</p><p className={client.blog.failed ? "error-text" : "muted"}>{client.blog.failed} con errores · {client.blog.pendingDeploy} por actualizar en el sitio</p>{client.active ? <SupportAccess defaultPath="/blog/calendario" clientId={client.id} clientName="calendario" /> : null}</td>
        <td>{client.catalog ? <><Badge tone={taskTone(client.catalog.status)}>{TASK_LABELS[client.catalog.status] || "Estado no disponible"}</Badge><p><Timestamp date={client.catalog.updatedAt} /></p></> : <span className="muted">Sin actualizaciones registradas</span>}</td>
        <td>{client.business ? <><Badge tone={taskTone(client.business.status)}>{TASK_LABELS[client.business.status] || "Estado no disponible"}</Badge><p><Timestamp date={client.business.updatedAt} /></p></> : <span className="muted">Sin análisis registrados</span>}</td>
      </tr>)}</tbody></table>{!clients.length ? <p className="empty-state sans">Elegí un cliente o quitá los filtros para revisar sus tareas.</p> : null}</div>
    </section>
    <section id="accesos" className="dashboard-section"><SectionHeading index="04" title="Usuarios y accesos a clientes" description={selected ? `Personas y accesos de ${selected.name}.` : "Personas con acceso y últimos ingresos de administradores a los paneles de clientes."} />
      <p className="sans muted">{number(dashboard.totals.users)} usuarios de clientes en total · {number(dashboard.totals.activeSupport)} accesos de administradores a clientes en uso</p>
      <div className="access-grid"><div className="card table-scroll"><h3 className="panel-title">Usuarios de clientes <span>Últimos 100</span></h3><table><thead><tr><th>Persona</th><th>Cliente</th><th>Permiso</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong><br /><small>{user.email}</small></td><td>{user.client.name}</td><td>{user.role === "admin" ? "Administrador" : "Operador"}</td></tr>)}</tbody></table>{!users.length ? <p className="empty-state sans">Sin usuarios registrados para esta selección.</p> : null}</div>
        <div className="card table-scroll"><h3 className="panel-title">Accesos de administradores a clientes <span>Últimos 30</span></h3><table><thead><tr><th>Cliente / persona</th><th>Estado</th><th>Vence</th><th>Acción</th></tr></thead><tbody>{sessions.map(session => { const state = supportState(session, dashboard.now); return <tr key={session.id}><td><strong>{session.client.name}</strong><p>{session.platformAdmin.name}</p></td><td><Badge tone={state.tone}>{state.label}</Badge></td><td><Timestamp date={session.expiresAt} /></td><td>{state.revocable ? <RevokeButton id={session.id} /> : "—"}</td></tr>; })}</tbody></table>{!sessions.length ? <p className="empty-state sans">Los accesos aparecerán cuando abras el panel de un cliente.</p> : null}</div>
      </div>
    </section>
    <section id="auditoria" className="dashboard-section"><SectionHeading index="05" title="Historial de cambios" description={`Quién hizo qué y cuándo: cambios de usuarios, clientes, problemas y accesos. Últimos 40 registros${selected ? ` de ${selected.name}` : " de toda la plataforma"}.`} /><p className="sans muted">{number(dashboard.totals.audits)} cambios administrativos guardados en toda la plataforma. Este historial no mide ventas ni resultados comerciales.</p><div className="card table-scroll"><table><thead><tr><th>Cuándo</th><th>Quién</th><th>Cliente</th><th>Qué hizo</th></tr></thead><tbody>{audits.map(event => <tr key={event.id}><td><Timestamp date={event.createdAt} /></td><td>{event.actor.name}</td><td>{event.client?.name || "Administración general"}</td><td>{auditActionLabel(event.action)}</td></tr>)}</tbody></table>{!audits.length ? <p className="empty-state sans">Cuando alguien cambie permisos o abra un cliente, el registro aparecerá aquí.</p> : null}</div></section>
    </div></details>
    <footer className="dashboard-footer sans">Los 5 Apóstoles · Datos guardados en la plataforma · Hora de Argentina</footer>
  </main>;
}
