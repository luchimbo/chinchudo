import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { updateIdentidadConfig } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";
const subHead = "mb-3 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate/40";

function listToText(json: string): string {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.join("\n") : "";
  } catch { return ""; }
}

function maskKey(key: string): string {
  if (!key) return "";
  return `configurada ····${key.slice(-4)}`;
}

export default async function IdentidadConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: slug } = await searchParams;
  if (!slug) notFound();

  const c = await prisma.client.findUnique({
    where: { slug },
    select: {
      id: true, name: true, description: true,
      domainKeywords: true, domainExclusions: true,
      openrouterApiKey: true, openrouterModel: true,
    },
  });

  if (!c) notFound();
  try { await assertClientAccess(prisma, c.id); } catch { notFound(); }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col px-5 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate/50">Configuración</p>
          <h1 className="font-display text-3xl text-ink">Identidad e IA</h1>
          <p className="mt-1 text-sm text-slate">
            Cómo se identifica el cliente y qué modelo de IA usa para generar contenido.
          </p>
        </div>
        <Link href={`/configuracion?client=${slug}`} className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          ← Configuración
        </Link>
      </header>

      <form action={updateIdentidadConfig} className="grid gap-4">
        <input type="hidden" name="id" value={c.id} />

        <p className={subHead} style={{ marginTop: 0 }}>Identidad</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={`${labelCls} md:col-span-2`}>
            Nombre del cliente
            <input name="name" defaultValue={c.name} required className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Descripción breve
            <input name="description" defaultValue={c.description ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            Temas del negocio (uno por línea)
            <span className={hintCls}>El agente busca oportunidades sobre estos temas.</span>
            <textarea name="domainKeywords" defaultValue={listToText(c.domainKeywords ?? "[]")} rows={5} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Temas a ignorar (uno por línea)
            <span className={hintCls}>El agente no generará contenido sobre estos temas.</span>
            <textarea name="domainExclusions" defaultValue={listToText(c.domainExclusions ?? "[]")} rows={5} className={`${inputCls} resize-y`} />
          </label>
        </div>

        <p className={subHead}>Inteligencia artificial</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            Clave de IA{c.openrouterApiKey ? <span className="font-normal text-emerald-600"> ✓ {maskKey(c.openrouterApiKey)}</span> : <span className="font-normal text-slate/50"> (usa la clave global)</span>}
            <input name="openrouterApiKey" type="password" autoComplete="off" placeholder="en blanco = conservar la actual" className={inputCls} />
          </label>
          <label className={labelCls}>
            Modelo de IA
            <span className={hintCls}>Modelo para generar respuestas y contenido.</span>
            <input name="openrouterModel" defaultValue={c.openrouterModel ?? ""} placeholder="google/gemini-2.0-flash-lite" className={inputCls} />
          </label>
        </div>

        <div className="mt-6 border-t border-ink/10 pt-6">
          <button type="submit" className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-paper transition hover:bg-slate">
            Guardar cambios
          </button>
        </div>
      </form>
    </div>
  );
}
