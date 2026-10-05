import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { loadDashboard } from "@/lib/dashboard-data";
import { ONBOARDING_LABELS, TASK_LABELS, supportState, taskTone } from "@/lib/dashboard-model";
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
    prisma.adminAuditEvent.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 40, select: { id: true, createdAt: true, action: true, targetType: true, actor: { select: { name: true } }, client: { select: { name: true } } } }),
    prisma.issueReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const query = (searchParams.q || "").trim().toLocaleLowerCase("es-AR");
  const clients = dashboard.clients.filter(client =>
    (!selected || client.id === selected.id) &&
    (!query || `${client.name} ${client.slug}`.toLocaleLowerCase("es-AR").includes(query)) &&
    (searchParams.state === "attention" ? client.alerts.length > 0 : searchParams.state === "active" ? client.active : searchParams.state === "suspended" ? !client.active : true)
  );
  const attentionCount = dashboard.clients.filter(client => client.alerts.length > 0).length;

  return <main className="shell dashboard">
    <header className="dashboard-header">
      <div><p className="eyebrow">Los 5 Apóstoles · administración</p><h1>Control <i>Room</i><span className="edition">Suite / 01</span></h1><p className="intro sans">Cada cliente, su actividad y lo que necesita atención.</p></div>
      <div className="admin-identity sans"><strong>{identity.profile.name}</strong><p>Actualizado <Timestamp date={dashboard.now} /></p><LogoutForm /></div>
    </header>
    <nav className="dashboard-nav sans" aria-label="Secciones del backoffice"><a href="#clientes">Clientes</a><a href="#operacion">Operación</a><Link href="/reportes">Reportes <span>{number(dashboard.totals.openReports)}</span></Link><a href="#accesos">Usuarios y soporte</a><a href="#auditoria">Auditoría</a></nav>
    <section className="stats-grid" aria-label="Totales de la plataforma">
      {[
        ["Clientes activos", dashboard.clients.filter(client => client.active).length, `${dashboard.clients.length} registrados`],
        ["Requieren atención", attentionCount, "Configuración o tareas"],
        ["Usuarios", dashboard.totals.users, "Total de la plataforma"],
        ["Soportes activos", dashboard.totals.activeSupport, "Sesiones ya iniciadas"],
        ["Reportes abiertos", dashboard.totals.openReports, "Problemas de la app"],
        ["Eventos auditados", dashboard.totals.audits, "Historial completo"],
      ].map(([label, value, note]) => <article className="stat" key={label}><p className="eyebrow">{label}</p><p className="stat-value">{number(Number(value))}</p><p className="sans muted">{note}</p></article>)}
    </section>

    <section id="clientes" className="dashboard-section">
      <SectionHeading index="01" title="Clientes" description="Actividad y configuración por cliente. Los totales de arriba siempre abarcan toda la plataforma." />
      <form className="dashboard-filters sans" method="GET">
        <label><span>Buscar cliente</span><input name="q" className="field" defaultValue={searchParams.q || ""} placeholder="Nombre o identificador" type="search" /></label>
        <label><span>Estado</span><select className="field" name="state" defaultValue={searchParams.state || "all"}><option value="all">Todos</option><option value="attention">Requieren atención</option><option value="active">Activos</option><option value="suspended">Suspendidos</option></select></label>
        <label><span>Cliente</span><select className="field" name="client" defaultValue={selected?.id || ""}><option value="">Toda la plataforma</option>{dashboard.clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <button className="button" type="submit">Filtrar</button><Link className="reset-link" href="/">Limpiar</Link>
      </form>
      <p className="sans muted results-note">{clients.length} de {dashboard.clients.length} clientes · Fechas y actividad de hoy en hora de Argentina</p>
      <div className="client-grid">{clients.map(client => <article key={client.id} className={`card client-card ${client.alerts.length ? "has-attention" : ""}`}>
        <div className="client-heading"><div><p className="eyebrow">{client.slug}</p><h3>{client.name}</h3></div><Badge tone={client.active ? "ok" : "neutral"}>{client.active ? "Activo" : "Suspendido"}</Badge></div>
        <p className="sans muted client-description">{client.description || "Descripción del negocio pendiente."}</p>
        <dl className="client-metrics sans">{[
          ["Oportunidades", client._count.opportunities], ["Por atender", client.pendingOpportunities], ["Artículos", client._count.landings],
          ["Contactos", client._count.leads], ["Tendencias", client._count.trends], ["Guiones", client._count.videoScripts], ["Mediciones de IA", client._count.aiPresenceResults], ["Usuarios", client._count.users],
        ].map(([label, value]) => <div key={label}><dd>{number(Number(value))}</dd><dt>{label}</dt></div>)}</dl>
        <div className="client-activity sans"><span>Última actividad registrada</span><strong><Timestamp date={client.lastActivityAt} /></strong></div>
        {client.alerts.length ? <div className="attention-box sans"><strong>Requiere atención</strong><ul>{client.alerts.map(alert => <li key={alert}>{alert}</li>)}</ul></div> : <p className="sans healthy-note">Sin alertas en los registros consultados</p>}
        <details className="client-config sans"><summary>Configuración y objetivos</summary><dl>
          <div><dt>Configuración inicial</dt><dd>{client.onboarding ? ONBOARDING_LABELS[client.onboarding.status] : "Sin alta registrada"}</dd></div>
          <div><dt>Marcas / voces propias</dt><dd>{client._count.brands} / {client._count.personas}</dd></div>
          <div><dt>Fuentes activas</dt><dd>{client._count.monitoredSources}</dd></div>
          <div><dt>Oportunidades creadas hoy / objetivo</dt><dd>{number(client.todayOpportunities)} / {client.dailyOpportunityTarget > 0 ? number(client.dailyOpportunityTarget) : "Sin objetivo"}</dd></div>
          <div><dt>Objetivo diario de borradores</dt><dd>{client.dailyDraftTarget > 0 ? number(client.dailyDraftTarget) : "Sin objetivo"}</dd></div>
          <div><dt>Aprobación / publicación automática</dt><dd>{client.autoApprove ? "Activada" : "Desactivada"} / {client.autoPublish ? "Activada" : "Desactivada"}</dd></div>
          <div><dt>Sitio del negocio</dt><dd>{client.storeUrl || "Sin configurar"}</dd></div><div><dt>Blog</dt><dd>{client.blogBaseUrl || "Sin configurar"}</dd></div>
        </dl></details>
        <div className="client-actions">{client.active ? <SupportAccess clientId={client.id} clientName={client.name} /> : <p className="sans muted">Activá el cliente para abrir sus módulos.</p>}<ClientStateButton id={client.id} active={client.active} /></div>
      </article>)}</div>
      {!clients.length ? <p className="empty-state sans">No hay clientes con estos filtros. Limpiá los filtros para ver todos.</p> : null}
    </section>

    <section id="operacion" className="dashboard-section"><SectionHeading index="02" title="Estado operativo" description="Colas de borradores, publicaciones y últimas ejecuciones guardadas. Esta vista no verifica si los procesos están conectados en este momento." />
      <div className="card table-scroll"><table><caption className="sr-only">Estado de tareas por cliente</caption><thead><tr><th>Cliente</th><th>Escucha</th><th>Borradores</th><th>Blog</th><th>Catálogo</th><th>Análisis del negocio</th></tr></thead><tbody>{clients.map(client => <tr key={client.id}>
        <td><strong>{client.name}</strong></td><td><p>{client._count.monitoredSources} fuentes activas</p><p className={client.sourceErrors ? "error-text" : "muted"}>{client.sourceErrors} con errores o bloqueos</p><small><Timestamp date={client.lastListenAt} /></small></td>
        <td><p>{client.draft.queued} en cola · {client.draft.processing} en proceso</p><p className={client.draft.failed ? "error-text" : "muted"}>{client.draft.failed} fallidas</p><small><Timestamp date={client.draft.updatedAt} /></small></td>
        <td><p>{client.blog.planned} planificadas · {client.blog.ready} listas</p><p>{client.blog.publishing} publicando · {client.blogApproval} por aprobar</p><p className={client.blog.failed ? "error-text" : "muted"}>{client.blog.failed} fallidas · {client.blog.pendingDeploy} por desplegar</p>{client.active ? <SupportAccess compact defaultPath="/blog/calendario" clientId={client.id} clientName="calendario" /> : null}</td>
        <td>{client.catalog ? <><Badge tone={taskTone(client.catalog.status)}>{TASK_LABELS[client.catalog.status] || client.catalog.status}</Badge><p><Timestamp date={client.catalog.updatedAt} /></p></> : <span className="muted">Sin ejecuciones</span>}</td>
        <td>{client.business ? <><Badge tone={taskTone(client.business.status)}>{TASK_LABELS[client.business.status] || client.business.status}</Badge><p><Timestamp date={client.business.updatedAt} /></p></> : <span className="muted">Sin ejecuciones</span>}</td>
      </tr>)}</tbody></table>{!clients.length ? <p className="empty-state sans">Seleccioná un cliente o limpiá los filtros para revisar su operación.</p> : null}</div>
    </section>

    <section id="reportes" className="dashboard-section"><SectionHeading index="03" title="Problemas reportados" description="Últimos 8 reportes abiertos de toda la plataforma. El registro actual no incluye una relación con el cliente." action={<Link href="/reportes" className="button secondary">Ver todos los reportes</Link>} /><ReportList reports={reports} /></section>
    <section id="accesos" className="dashboard-section"><SectionHeading index="04" title="Usuarios y soporte" description={selected ? `Registros de ${selected.name}.` : "Registros recientes de toda la plataforma."} />
      <div className="access-grid"><div className="card table-scroll"><h3 className="panel-title">Usuarios <span>Últimos 100</span></h3><table><thead><tr><th>Usuario</th><th>Cliente</th><th>Rol</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><strong>{user.name}</strong><br /><small>{user.email}</small></td><td>{user.client.name}</td><td>{user.role}</td></tr>)}</tbody></table>{!users.length ? <p className="empty-state sans">Sin usuarios registrados en esta selección.</p> : null}</div>
        <div className="card table-scroll"><h3 className="panel-title">Sesiones de soporte <span>Últimas 30</span></h3><table><thead><tr><th>Cliente / administrador</th><th>Estado</th><th>Vencimiento</th><th>Control</th></tr></thead><tbody>{sessions.map(session => { const state = supportState(session, dashboard.now); return <tr key={session.id}><td><strong>{session.client.name}</strong><p>{session.platformAdmin.name}</p></td><td><Badge tone={state.tone}>{state.label}</Badge></td><td><Timestamp date={session.expiresAt} /></td><td>{state.revocable ? <RevokeButton id={session.id} /> : "—"}</td></tr>; })}</tbody></table>{!sessions.length ? <p className="empty-state sans">Las sesiones aparecerán cuando abras un cliente desde el panel.</p> : null}</div>
      </div>
    </section>
    <section id="auditoria" className="dashboard-section"><SectionHeading index="05" title="Auditoría administrativa" description={`Últimos 40 eventos${selected ? ` de ${selected.name}` : " de toda la plataforma"}. El contador superior muestra el historial completo.`} /><div className="card table-scroll"><table><thead><tr><th>Fecha</th><th>Actor</th><th>Cliente</th><th>Acción</th><th>Objetivo</th></tr></thead><tbody>{audits.map(event => <tr key={event.id}><td><Timestamp date={event.createdAt} /></td><td>{event.actor.name}</td><td>{event.client?.name || "Plataforma"}</td><td>{event.action}</td><td>{event.targetType}</td></tr>)}</tbody></table>{!audits.length ? <p className="empty-state sans">Las acciones administrativas quedarán registradas aquí.</p> : null}</div></section>
    <footer className="dashboard-footer sans">Administración global · Acceso de soporte limitado a un cliente · Hora de Argentina</footer>
  </main>;
}
