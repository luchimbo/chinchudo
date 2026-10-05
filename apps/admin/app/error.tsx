"use client";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="shell dashboard"><div className="card report-card"><p className="eyebrow">Administración</p><h1>No se pudo cargar el panel</h1><p className="sans muted">Volvé a intentarlo. Si el problema continúa, revisá la conexión de la aplicación con la base de datos.</p><button className="button" onClick={reset}>Volver a intentar</button></div></main>;
}
