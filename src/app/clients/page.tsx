import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { createClient, updateClient, clearApiKey } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

// JSON array string -> texto (una entrada por línea) para el textarea.
function listToText(json: string): string {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.join("\n") : "";
  } catch {
    return "";
  }
}

function maskKey(key: string): string {
  if (!key) return "— sin configurar —";
  const tail = key.slice(-4);
  return `configurada ····${tail}`;
}

export default async function ClientsPage() {
  const clients = await getVisibleClients(prisma);

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-moss">Admin</p>
          <h1 className="font-display text-4xl text-ink">Clientes</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Cada cliente trae su propio <strong>dominio</strong> (keywords y exclusiones), su{" "}
            <strong>API key de OpenRouter</strong> y su modelo. La key se usa al generar respuestas de ese
            cliente; si queda vacía, se cae al <code>.env</code> global.
          </p>
        </div>
        <Link href="/admin" className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          Volver
        </Link>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nuevo cliente</h2>
        <form action={createClient} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <label className={labelCls}>Nombre<input name="name" required className={inputCls} /></label>
          <label className={labelCls}>Slug<input name="slug" required placeholder="medias" className={inputCls} /></label>
          <label className={`${labelCls} md:col-span-2`}>Descripción<input name="description" className={inputCls} /></label>
          <label className={labelCls}>Keywords de dominio (una por línea)<textarea name="domainKeywords" rows={4} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>Exclusiones (una por línea)<textarea name="domainExclusions" rows={4} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>OpenRouter API key<input name="openrouterApiKey" type="password" autoComplete="off" placeholder="sk-or-…" className={inputCls} /></label>
          <label className={labelCls}>OpenRouter modelo<input name="openrouterModel" placeholder="google/gemini-2.0-flash-lite" className={inputCls} /></label>
          <div className="flex flex-wrap gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="active" defaultChecked /> Activo</label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoApprove" /> Auto-aprobar</label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoPublish" /> Auto-publicar</label>
          </div>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Crear cliente</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Clientes ({clients.length})</h2>
        <div className="mt-4 grid gap-3">
          {clients.map((c) => (
            <form key={c.id} action={updateClient} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={c.id} />
              <label className={labelCls}>
                Nombre {c.active ? <span className="text-moss">● activo</span> : <span className="text-slate/60">○ inactivo</span>}
                <input name="name" defaultValue={c.name} required className={inputCls} />
              </label>
              <label className={labelCls}>Slug<input name="slug" defaultValue={c.slug} required className={inputCls} /></label>
              <label className={`${labelCls} md:col-span-2`}>Descripción<input name="description" defaultValue={c.description} className={inputCls} /></label>
              <label className={labelCls}>Keywords de dominio<textarea name="domainKeywords" defaultValue={listToText(c.domainKeywords)} rows={5} className={`${inputCls} resize-y`} /></label>
              <label className={labelCls}>Exclusiones<textarea name="domainExclusions" defaultValue={listToText(c.domainExclusions)} rows={5} className={`${inputCls} resize-y`} /></label>
              <label className={labelCls}>
                OpenRouter API key <span className="font-normal text-slate/60">({maskKey(c.openrouterApiKey)})</span>
                <input name="openrouterApiKey" type="password" autoComplete="off" placeholder="dejar en blanco = conservar" className={inputCls} />
              </label>
              <label className={labelCls}>OpenRouter modelo<input name="openrouterModel" defaultValue={c.openrouterModel} placeholder="google/gemini-2.0-flash-lite" className={inputCls} /></label>
              <div className="flex flex-wrap gap-4 md:col-span-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="active" defaultChecked={c.active} /> Activo</label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoApprove" defaultChecked={c.autoApprove} /> Auto-aprobar</label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoPublish" defaultChecked={c.autoPublish} /> Auto-publicar</label>
              </div>
              <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-2">
                <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                {c.openrouterApiKey ? (
                  <button formAction={clearApiKey} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Borrar API key</button>
                ) : null}
              </div>
            </form>
          ))}
          {clients.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin clientes visibles.</p> : null}
        </div>
      </section>
    </main>
  );
}
