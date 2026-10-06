"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SUPPORT_PATHS } from "@/lib/dashboard-model";

function BusyLabel({ children }: { children: React.ReactNode }) {
  return <span role="status" className="admin-pending"><span className="admin-spinner" aria-hidden="true" />{children}</span>;
}

export function SupportAccess({ clientId, clientName, defaultPath = "/" }: { clientId: string; clientName: string; defaultPath?: typeof SUPPORT_PATHS[number] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    try {
    const response = await fetch("/api/support-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, targetPath: defaultPath }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo iniciar.");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.exchangeUrl;
    const input = document.createElement("input");
    input.type = "hidden"; input.name = "code"; input.value = data.code;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar el acceso.");
      setBusy(false);
    }
  }

  return (
    <div className="support-access">
      <button className="button" onClick={start} disabled={busy}>{busy ? <BusyLabel>Abriendo…</BusyLabel> : `Abrir ${clientName}`}</button>
      {error ? <small className="sans" role="alert" style={{ color: "#9d3825" }}>{error}</small> : null}
    </div>
  );
}

export function ClientStateButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle() {
    setBusy(true); setError("");
    try {
    const response = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (!response.ok) throw new Error((await response.json()).error || "No se pudo actualizar.");
    router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar."); }
    finally { setBusy(false); }
  }
  return <span><button className={`button ${active ? "secondary" : ""}`} onClick={toggle} disabled={busy}>{busy ? <BusyLabel>Actualizando…</BusyLabel> : active ? "Suspender" : "Activar"}</button>{error ? <small className="sans" role="alert" style={{ display: "block", color: "#9d3825", marginTop: 6 }}>{error}</small> : null}</span>;
}

export function RevokeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function revoke() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/support-sessions/${id}/revoke`, { method: "POST" });
      if (!response.ok) throw new Error("No se pudo revocar el acceso.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo revocar el acceso."); }
    finally { setBusy(false); }
  }
  return <span><button className="button danger" onClick={revoke} disabled={busy}>{busy ? <BusyLabel>Quitando acceso…</BusyLabel> : "Quitar acceso"}</button>{error ? <small className="sans" role="alert" style={{ display: "block", color: "#9d3825", marginTop: 6 }}>{error}</small> : null}</span>;
}

export function ReportStateButton({ id, status }: { id: string; status: "OPEN" | "RESOLVED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/issue-reports/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: status === "OPEN" ? "RESOLVED" : "OPEN" }) });
      if (!response.ok) throw new Error((await response.json()).error || "No se pudo actualizar el reporte. Volvé a intentarlo.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar el reporte. Volvé a intentarlo."); }
    finally { setBusy(false); }
  }
  return <div><button className="button secondary" disabled={busy} onClick={update}>{busy ? <BusyLabel>Actualizando…</BusyLabel> : status === "OPEN" ? "Marcar resuelto" : "Reabrir reporte"}</button>{error ? <p className="control-error sans" role="alert">{error}</p> : null}</div>;
}
