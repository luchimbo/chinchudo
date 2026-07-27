import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { ClientStateButton, RevokeButton, SupportAccess } from "./controls";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const identity = await requirePlatformAdmin();
  if (!identity) redirect("/login");

  const [clients, users, sessions, audits] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { users: true, opportunities: true, leads: true } },
      },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { client: { select: { name: true } } },
    }),
    prisma.supportSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        client: { select: { name: true } },
        platformAdmin: { select: { name: true } },
      },
    }),
    prisma.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { name: true } }, client: { select: { name: true } } },
    }),
  ]);
  const activeSupport = sessions.filter((session) =>
    !session.revokedAt && !session.endedAt && session.exchangedAt && session.expiresAt > new Date()
  );

  return (
    <main className="shell" style={{ padding: "34px 0 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 20, marginBottom: 42 }}>
        <div>
          <p className="eyebrow">Los 5 Apóstoles · plataforma</p>
          <h1 style={{ fontSize: "clamp(52px, 8vw, 104px)", lineHeight: .82, margin: "20px 0 0", letterSpacing: "-.055em" }}>
            Control <i>Room</i>
          </h1>
        </div>
        <div className="sans" style={{ textAlign: "right" }}>
          <strong>{identity.profile.name}</strong>
          <p style={{ margin: "4px 0 14px", opacity: .6 }}>Sesion administrativa segura</p>
          <form action="/api/auth/logout" method="POST"><button className="button secondary">Cerrar sesión</button></form>
        </div>
      </header>

      <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 30 }}>
        {[
          ["Clientes", clients.length],
          ["Usuarios tenant", users.length],
          ["Soportes activos", activeSupport.length],
          ["Eventos auditados", audits.length],
        ].map(([label, value]) => (
          <article className="card" key={label} style={{ padding: 22 }}>
            <p className="eyebrow">{label}</p><p style={{ fontSize: 54, margin: "16px 0 0" }}>{value}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ padding: 24, overflowX: "auto", marginBottom: 30 }}>
        <p className="eyebrow">Clientes y acceso de soporte</p>
        <table>
          <thead><tr><th>Cliente</th><th>Estado</th><th>Usuarios</th><th>Oportunidades</th><th>Leads</th><th>Control</th><th>Acceso total</th></tr></thead>
          <tbody>{clients.map((client) => (
            <tr key={client.id}>
              <td><strong>{client.name}</strong><br /><small>{client.slug}</small></td>
              <td>{client.active ? "Activo" : "Suspendido"}</td>
              <td>{client._count.users}</td><td>{client._count.opportunities}</td><td>{client._count.leads}</td>
              <td><ClientStateButton id={client.id} active={client.active} /></td>
              <td>{client.active ? <SupportAccess clientId={client.id} clientName={client.name} /> : "Activá el cliente primero"}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 520px), 1fr))" }}>
        <section className="card" style={{ padding: 24, overflowX: "auto" }}>
          <p className="eyebrow">Usuarios por cliente</p>
          <table><thead><tr><th>Usuario</th><th>Cliente</th><th>Rol</th></tr></thead>
            <tbody>{users.map((user) => <tr key={user.id}><td><strong>{user.name}</strong><br /><small>{user.email}</small></td><td>{user.client.name}</td><td>{user.role}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="card" style={{ padding: 24, overflowX: "auto" }}>
          <p className="eyebrow">Sesiones de soporte</p>
          <table><thead><tr><th>Cliente</th><th>Administrador</th><th>Estado</th><th></th></tr></thead>
            <tbody>{sessions.map((session) => {
              const active = !session.revokedAt && !session.endedAt && session.expiresAt > new Date();
              return <tr key={session.id}><td><strong>{session.client.name}</strong><br /><small>{session.reason}</small></td><td>{session.platformAdmin.name}</td><td>{session.revokedAt ? "Revocada" : session.endedAt ? "Finalizada" : active ? "Activa" : "Vencida"}</td><td>{active ? <RevokeButton id={session.id} /> : null}</td></tr>;
            })}</tbody>
          </table>
        </section>
      </div>

      <section className="card" style={{ padding: 24, overflowX: "auto", marginTop: 30 }}>
        <p className="eyebrow">Bitácora inmutable de administración</p>
        <table><thead><tr><th>Fecha</th><th>Actor</th><th>Cliente</th><th>Acción</th><th>Objetivo</th></tr></thead>
          <tbody>{audits.map((event) => <tr key={event.id}><td>{event.createdAt.toLocaleString("es-AR")}</td><td>{event.actor.name}</td><td>{event.client?.name || "Plataforma"}</td><td>{event.action}</td><td>{event.targetType}</td></tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
