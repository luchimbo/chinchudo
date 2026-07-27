"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [accessToken, setAccessToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token");
    if (!token) {
      setMessage("El enlace no contiene un token válido. Pedí una recuperación nueva.");
      return;
    }
    setAccessToken(token);
    window.history.replaceState({}, "", "/reset-password");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessToken) return setMessage("El enlace venció. Pedí uno nuevo.");
    if (password.length < 12) return setMessage("Usá una contraseña de al menos 12 caracteres.");
    if (password !== confirmation) return setMessage("Las contraseñas no coinciden.");
    setBusy(true); setMessage("");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, password }),
    });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "No se pudo actualizar la contraseña."); setBusy(false); return; }
    window.location.assign("/login?reset=1");
  }

  return (
    <main className="shell" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 0" }}>
      <section className="card" style={{ width: "min(100%, 460px)", padding: "42px" }}>
        <p className="eyebrow">Recuperación segura</p>
        <h1 style={{ fontSize: "clamp(40px, 8vw, 62px)", lineHeight: .9, margin: "20px 0" }}>Nueva<br /><i>contraseña</i></h1>
        <p className="sans" style={{ lineHeight: 1.5, color: "rgba(23,35,30,.65)" }}>Elegí una contraseña de al menos 12 caracteres para el acceso administrativo.</p>
        {message ? <p className="sans" role="alert" style={{ color: "#9d3825", fontWeight: 700 }}>{message}</p> : null}
        <form className="grid" style={{ marginTop: 26 }} onSubmit={submit}>
          <label className="sans"><span className="eyebrow">Nueva contraseña</span><input className="field" type="password" required minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="sans"><span className="eyebrow">Repetir contraseña</span><input className="field" type="password" required minLength={12} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button className="button" disabled={busy || !accessToken}>{busy ? "Actualizando…" : "Guardar contraseña"}</button>
        </form>
      </section>
    </main>
  );
}
