"use client";

import { useEffect, useState } from "react";

type State = "idle" | "pending" | "success" | "error";

export default function PreviewControls() {
  const [state, setState] = useState<State>("idle");
  const [failure, setFailure] = useState(false);

  useEffect(() => {
    if (state !== "pending") return;
    const timer = setTimeout(() => setState(failure ? "error" : "success"), 2400);
    return () => clearTimeout(timer);
  }, [state, failure]);

  return <section className="card" style={{ padding: 24 }} aria-labelledby="admin-result-title">
    <p className="eyebrow">03 / Resultados</p>
    <h2 id="admin-result-title" style={{ fontSize: 28, margin: "12px 0" }}>Espera y error</h2>
    <p className="sans" style={{ fontSize: 14, lineHeight: 1.6, opacity: .7 }}>Simulá una operación exitosa o fallida para comprobar el mensaje y el reintento.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
      <button className="button" type="button" disabled={state === "pending"} onClick={() => { setFailure(false); setState("pending"); }}>Aprobar prueba</button>
      <button className="button secondary" type="button" disabled={state === "pending"} onClick={() => { setFailure(true); setState("pending"); }}>Simular error</button>
    </div>
    <p className="sans" aria-live="polite" style={{ minHeight: 24, fontSize: 14, marginTop: 18 }}>
      {state === "pending" ? <span className="admin-pending"><span className="admin-spinner" aria-hidden="true" />Aprobando…</span> : null}
      {state === "success" ? "Aprobación simulada. Podés volver a intentarlo." : null}
      {state === "error" ? <span role="alert" style={{ color: "var(--rust)" }}>No se pudo aprobar. Podés reintentar.</span> : null}
    </p>
  </section>;
}
