"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, clientName }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ocurrió un error inesperado.");
      }

      // Registro exitoso, redirigir al onboarding de configuración
      router.push("/configuracion");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 bg-slate-50">
      <div className="grain" />
      <div className="w-full max-w-md z-10">
        <div className="mb-6 text-center">
          <h1 className="mt-3 font-display text-4xl text-slate-900 tracking-tight font-extrabold">
            Comenzar de Cero
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Creá tu cuenta de administrador y tu espacio de trabajo
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-xl backdrop-blur-md">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-150 px-4 py-3 text-sm text-red-650 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label htmlFor="name" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Tu Nombre Completo
              </span>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="Juan Pérez"
              />
            </label>

            <label htmlFor="email" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Email / Usuario
              </span>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="juan@empresa.com"
              />
            </label>

            <label htmlFor="clientName" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Nombre de tu Negocio / Marca
              </span>
              <input
                id="clientName"
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="Mi Tienda de Ropa"
              />
            </label>

            <label htmlFor="password" className="block">
              <span className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 block mb-1.5">
                Contraseña
              </span>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-250 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-800 focus:bg-white focus:outline-none focus:ring-4 focus:ring-slate-800/5 transition-all"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-full bg-slate-950 py-3 text-sm font-semibold text-white shadow-lg hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-500/20 active:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 hover:-translate-y-0.5"
            >
              {loading ? "Creando espacio..." : "Crear Espacio y Comenzar"}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-400">
            ¿Ya tenés una cuenta?{" "}
            <Link href="/login" className="text-slate-600 font-semibold hover:underline">
              Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
