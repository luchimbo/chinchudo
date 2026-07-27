"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SupportAccess({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    const response = await fetch("/api/support-sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "No se pudo iniciar."); setBusy(false); return; }
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.exchangeUrl;
    const input = document.createElement("input");
    input.type = "hidden"; input.name = "code"; input.value = data.code;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <div className="grid" style={{ gap: 8, minWidth: 260 }}>
      <button className="button" onClick={start} disabled={busy}>{busy ? "Abriendo…" : `Abrir ${clientName}`}</button>
      {error ? <small className="sans" style={{ color: "#9d3825" }}>{error}</small> : null}
    </div>
  );
}

export function ClientStateButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    const response = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    if (response.ok) router.refresh();
    else alert((await response.json()).error || "No se pudo actualizar.");
    setBusy(false);
  }
  return <button className={`button ${active ? "secondary" : ""}`} onClick={toggle} disabled={busy}>{active ? "Suspender" : "Activar"}</button>;
}

export function RevokeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function revoke() {
    setBusy(true);
    const response = await fetch(`/api/support-sessions/${id}/revoke`, { method: "POST" });
    if (response.ok) router.refresh();
    setBusy(false);
  }
  return <button className="button danger" onClick={revoke} disabled={busy}>{busy ? "Revocando…" : "Revocar"}</button>;
}
