import Link from "next/link";
import { prisma } from "@/lib/db";
import { createPrompt, updatePrompt, deletePrompt, activatePrompt } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

export default async function PromptsPage({ searchParams }: { searchParams?: { client?: string } }) {
  const prompts = await prisma.promptVersion.findMany({ orderBy: [{ name: "asc" }, { version: "asc" }] });
  const clientQuery = searchParams?.client ? `?client=${searchParams.client}` : "";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">Prompts</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            El <strong>system prompt activo</strong> de <code>response-generator</code> se inyecta en
            cada generación con IA. Solo uno activo por nombre.
          </p>
        </div>
        <Link href={`/admin${clientQuery}`} className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          ← Configuración
        </Link>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nuevo prompt</h2>
        <form action={createPrompt} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <label className={labelCls}>Nombre<input name="name" defaultValue="response-generator" required className={inputCls} /></label>
          <label className={labelCls}>Versión<input name="version" required placeholder="0.2.0" className={inputCls} /></label>
          <label className={`${labelCls} md:col-span-2`}>System prompt<textarea name="systemPrompt" required rows={4} className={`${inputCls} resize-y`} /></label>
          <label className={`${labelCls} md:col-span-2`}>User prompt template (opcional)<textarea name="userPromptTemplate" rows={3} className={`${inputCls} resize-y`} /></label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar prompt</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Versiones ({prompts.length})</h2>
        <div className="mt-4 grid gap-3">
          {prompts.map((p) => (
            <form key={p.id} action={updatePrompt} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
              <input type="hidden" name="id" value={p.id} />
              <label className={labelCls}>
                Nombre {p.active ? <span className="text-moss">● activo</span> : null}
                <input name="name" defaultValue={p.name} required className={inputCls} />
              </label>
              <label className={labelCls}>Versión<input name="version" defaultValue={p.version} required className={inputCls} /></label>
              <label className={`${labelCls} md:col-span-2`}>System prompt<textarea name="systemPrompt" defaultValue={p.systemPrompt} required rows={4} className={`${inputCls} resize-y`} /></label>
              <label className={`${labelCls} md:col-span-2`}>User prompt template<textarea name="userPromptTemplate" defaultValue={p.userPromptTemplate} rows={3} className={`${inputCls} resize-y`} /></label>
              <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-2">
                <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                {p.active ? null : (
                  <button formAction={activatePrompt} className="rounded-full border border-moss/40 bg-moss/10 px-4 py-2 text-sm font-bold text-moss hover:bg-moss/20">Activar</button>
                )}
                <button formAction={deletePrompt} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
              </div>
            </form>
          ))}
          {prompts.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin prompts cargados.</p> : null}
        </div>
      </section>
    </div>
  );
}
