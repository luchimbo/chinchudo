"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoadingSpinner } from "@/components/loading-ui";
import { validatePassword } from "@/lib/password-policy";

type FieldName = "name" | "email" | "clientName" | "password";
const input = "min-h-11 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-base text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20 disabled:opacity-60";

export default function RegisterPage() {
  const router = useRouter();
  const [values, setValues] = useState({ name: "", email: "", clientName: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string[]>>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const submitting = useRef(false);
  const focusError = (errors: Partial<Record<FieldName, string[]>>) => {
    const first = (["name", "email", "clientName", "password"] as const).find(key => errors[key]?.length);
    if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
  };
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const policy = validatePassword(values.password, values.email.trim());
    if (!policy.valid) {
      const errors = { password: [policy.error] };
      setFieldErrors(errors); focusError(errors); return;
    }
    submitting.current = true; setLoading(true); setError(""); setFieldErrors({}); setTimedOut(false);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values), signal: AbortSignal.timeout(25_000),
      });
      const data = await response.json();
      if (!response.ok) { setFieldErrors(data.fieldErrors || {}); focusError(data.fieldErrors || {}); throw new Error(data.error || "No se pudo crear la cuenta. Intentá de nuevo."); }
      router.push(typeof data.next === "string" && data.next.startsWith("/onboarding?") ? data.next : "/onboarding");
      router.refresh();
    } catch (err) {
      const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      setTimedOut(timeout);
      setError(timeout ? "La creación está demorando. Podés reintentar o intentar ingresar si la cuenta ya se creó." : err instanceof Error ? err.message : "No se pudo crear la cuenta. Revisá tu conexión e intentá de nuevo.");
    } finally { submitting.current = false; setLoading(false); }
  }
  const fields = [
    { key: "name", label: "Tu nombre", placeholder: "Juan Pérez", autoComplete: "name", type: "text", maxLength: 100 },
    { key: "email", label: "Email", placeholder: "juan@empresa.com", autoComplete: "email", type: "email", maxLength: 254 },
    { key: "clientName", label: "Nombre del negocio", placeholder: "Mi tienda", autoComplete: "organization", type: "text", maxLength: 160 },
    { key: "password", label: "Contraseña", placeholder: "Elegí una contraseña", autoComplete: "new-password", type: showPassword ? "text" : "password", maxLength: 128 },
  ] as const;
  return <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-8">
    <div className="w-full max-w-md">
      <header className="mb-7"><p className="text-sm font-bold tracking-wide text-moss">Cafishia</p><h1 className="mt-3 font-display text-4xl text-ink">Creá tu cuenta.</h1><p className="mt-3 text-sm leading-relaxed text-slate">Después completamos lo básico de tu negocio.</p></header>
      <form onSubmit={handleSubmit} aria-busy={loading} className="space-y-5 rounded-3xl border border-ink/10 bg-white p-6 shadow-sm sm:p-8">
        {error ? <div role="alert" className="rounded-xl border border-signal/30 bg-signal/5 p-3 text-sm text-ink">{error}{timedOut ? <Link href="/login" className="mt-2 block font-semibold text-moss underline">Intentar ingresar</Link> : null}</div> : null}
        {fields.map(field => <div key={field.key}>
          <label htmlFor={field.key} className="mb-2 block text-sm font-semibold text-ink">{field.label}</label>
          <div className={field.key === "password" ? "flex items-center gap-2" : ""}>
            <input id={field.key} name={field.key} required type={field.type} value={values[field.key]} autoComplete={field.autoComplete} maxLength={field.maxLength} minLength={field.key === "password" ? 10 : undefined} disabled={loading}
              aria-invalid={!!fieldErrors[field.key]?.length} aria-describedby={[field.key === "password" ? "password-help" : "", fieldErrors[field.key]?.length ? `${field.key}-error` : ""].filter(Boolean).join(" ") || undefined}
              onChange={e => { setValues(current => ({ ...current, [field.key]: e.target.value })); setFieldErrors(current => ({ ...current, [field.key]: undefined })); }} className={input} placeholder={field.placeholder} />
            {field.key === "password" ? <button type="button" disabled={loading} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword} onClick={() => setShowPassword(current => !current)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-moss underline focus:outline-none focus:ring-2 focus:ring-moss">{showPassword ? "Ocultar" : "Mostrar"}</button> : null}
          </div>
          {field.key === "password" ? <p id="password-help" className="mt-2 text-sm text-slate">Al menos 10 caracteres. Evitá contraseñas comunes o iguales a tu email.</p> : null}
          {fieldErrors[field.key]?.length ? <p id={`${field.key}-error`} role="alert" className="mt-2 text-sm text-signal">{fieldErrors[field.key]![0]}</p> : null}
        </div>)}
        <button type="submit" disabled={loading} className="min-h-12 w-full rounded-full bg-ink px-5 py-3 text-sm font-bold text-paper transition hover:bg-moss focus:outline-none focus:ring-4 focus:ring-moss/25 disabled:opacity-50">{loading ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Creando tu cuenta…</span> : "Crear cuenta"}</button>
        <p className="text-center text-sm text-slate">¿Ya tenés una cuenta? <Link href="/login" className="font-semibold text-moss underline">Ingresar</Link></p>
        <p className="text-center text-sm"><Link href="/recuperar" className="text-slate underline">Recuperar contraseña</Link></p>
      </form>
    </div>
  </main>;
}
