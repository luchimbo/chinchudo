"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email") || ""), password: String(form.get("password") || "") }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "Credenciales inválidas."); setBusy(false); return; }
    window.location.assign("/");
  }

  return (
    <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}>
      <section className="card" style={{ width: "min(100%, 460px)", padding: "42px" }}>
        <p className="eyebrow">Superficie aislada</p>
        <h1 style={{ fontSize: "clamp(42px, 8vw, 68px)", lineHeight: .88, margin: "22px 0 16px" }}>Control<br /><i>Room</i></h1>
        <p className="sans" style={{ color: "rgba(23,35,30,.65)", lineHeight: 1.5 }}>Acceso exclusivo para administración de plataforma. Toda entrada a un cliente queda registrada.</p>
        {error ? <p className="sans" role="alert" style={{ color: "#9d3825", fontWeight: 700 }}>{error}</p> : null}
        <form onSubmit={submit} className="grid" style={{ marginTop: 28 }}>
          <label className="sans"><span className="eyebrow">Email</span><input className="field" name="email" type="email" required autoComplete="email" /></label>
          <label className="sans"><span className="eyebrow">Contraseña</span><input className="field" name="password" type="password" required autoComplete="current-password" /></label>
          <button className="button" disabled={busy}>{busy ? "Verificando…" : "Entrar"}</button>
        </form>
      </section>
    </main>
  );
}
