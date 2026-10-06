export default function AdminLoading() {
  return <main className="shell admin-loading" role="status" aria-live="polite">
    <div className="admin-loading-indicator">
      <span className="admin-spinner admin-loading-spinner" aria-hidden="true" />
      <span className="sans">Cargando resumen…</span>
    </div>
    <div className="admin-loading-block" aria-hidden="true" style={{ width: 180, height: 16 }} />
    <div className="admin-loading-block" aria-hidden="true" style={{ width: 300, maxWidth: "100%", height: 54, marginTop: 18 }} />
    <div className="admin-loading-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => <div key={item} className="card admin-loading-card"><div className="admin-loading-block" style={{ width: "50%", height: 14 }} /><div className="admin-loading-block" style={{ width: "75%", height: 28, marginTop: 24 }} /></div>)}
    </div>
    <div className="card admin-loading-card" aria-hidden="true">{[0, 1, 2, 3].map((item) => <div key={item} className="admin-loading-block" style={{ width: "100%", height: 35, marginBottom: 15 }} />)}</div>
  </main>;
}
