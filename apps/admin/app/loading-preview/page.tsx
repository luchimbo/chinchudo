import { notFound } from "next/navigation";
import AdminLoading from "../loading";
import { PendingButton } from "../pending-button";
import PreviewControls from "./preview-controls";

export const dynamic = "force-dynamic";

async function waitForPreview() {
  "use server";
  await new Promise((resolve) => setTimeout(resolve, 2200));
}

export default function AdminLoadingPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <main className="shell" style={{ padding: "48px 0 80px" }}>
    <header style={{ maxWidth: 760, marginBottom: 32 }}>
      <p className="eyebrow">Laboratorio local · Administración</p>
      <h1 style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", lineHeight: 1.02, margin: "16px 0" }}>Estados de carga</h1>
      <p className="sans" style={{ lineHeight: 1.6, opacity: .7 }}>Probá el esqueleto del panel y las acciones pendientes. Esta vista no modifica datos y solo está disponible en localhost durante desarrollo.</p>
    </header>

    <section className="card" style={{ padding: 24, marginBottom: 20, overflow: "hidden" }} aria-labelledby="admin-skeleton-title">
      <p className="eyebrow">01 / Navegación</p>
      <h2 id="admin-skeleton-title" style={{ fontSize: 28, margin: "12px 0 4px" }}>Esqueleto de administración</h2>
      <p className="sans" style={{ fontSize: 14, opacity: .65 }}>Es el mismo que aparece mientras carga el panel.</p>
      <div style={{ border: "1px solid var(--line)", marginTop: 22, background: "var(--paper)", overflow: "hidden" }}><AdminLoading /></div>
    </section>

    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))" }}>
      <section className="card" style={{ padding: 24 }} aria-labelledby="admin-action-title">
        <p className="eyebrow">02 / Acciones</p>
        <h2 id="admin-action-title" style={{ fontSize: 28, margin: "12px 0" }}>Botón pendiente real</h2>
        <p className="sans" style={{ fontSize: 14, lineHeight: 1.6, opacity: .7 }}>El envío de prueba tarda 2,2 segundos. El botón se deshabilita durante la espera.</p>
        <form action={waitForPreview} style={{ marginTop: 24 }}><PendingButton className="button" pendingText="Guardando…">Guardar prueba</PendingButton></form>
      </section>
      <PreviewControls />
    </div>
  </main>;
}
