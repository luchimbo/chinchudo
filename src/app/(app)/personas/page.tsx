import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { PERSONA_NAME_SET } from "@/lib/persona-router";
import { createPersona, updatePersona, deletePersona } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";

export default async function PersonasPage({ searchParams }: { searchParams: { client?: string } }) {
  const clients = await getVisibleClients(prisma);
  const activeClient = clients.find((client) => client.slug === searchParams.client) ?? clients[0] ?? null;
  const personas = await prisma.persona.findMany({
    where: activeClient ? { clientId: activeClient.id } : undefined,
    include: { _count: { select: { responses: true } } },
    orderBy: { name: "asc" }
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-5 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-ink">Personas (voces)</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Rol, tono, objetivos y ejemplos de cada voz del quinteto.
          </p>
        </div>
        <Link href={activeClient ? `/configuracion?client=${activeClient.slug}` : "/configuracion"} className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          ← Configuración
        </Link>
      </header>

      <p className="mb-6 rounded-md border border-brass/40 bg-brass/10 p-3 text-xs leading-5 text-ink">
        <strong>Atención:</strong> el <em>nombre</em> de cada persona debe coincidir exactamente con el
        ruteador (<code>src/lib/persona-router.ts</code>). Editá tono, objetivos y ejemplos con
        libertad; si cambiás el nombre y deja de coincidir, el ruteo de esa voz falla (el draft-worker
        lo registra como error). Nombres canónicos: {Array.from(PERSONA_NAME_SET).join(", ")}.
      </p>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nueva persona</h2>
        <form action={createPersona} className="mt-4 grid gap-3 rounded-lg border border-ink/10 bg-white/70 p-4 shadow-panel md:grid-cols-2">
          <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
          <label className={labelCls}>Nombre<input name="name" required className={inputCls} /></label>
          <label className={labelCls}>Longitud preferida<input name="preferredLength" placeholder="Corta / Media" className={inputCls} /></label>
          <label className={labelCls}>Rol<input name="role" required className={inputCls} /></label>
          <label className={labelCls}>Tono<input name="tone" required className={inputCls} /></label>
           <label className={labelCls}>Avatar (Local: Ruta Video/Imagen o URL)<input name="avatarUrl" placeholder="Ej: https://images.unsplash.com/... o D:\avatar.mp4" className={inputCls} /></label>
          <label className={labelCls}>Voz IA (Local Edge-TTS)
            <select name="voiceId" className={inputCls}>
              <option value="es-AR-TomasNeural">Argentina - Tomás (Masculino)</option>
              <option value="es-AR-ElenaNeural">Argentina - Elena (Femenino)</option>
              <option value="es-MX-JorgeNeural">México - Jorge (Masculino)</option>
              <option value="es-MX-DaliaNeural">México - Dalia (Femenino)</option>
              <option value="es-ES-AlvaroNeural">España - Álvaro (Masculino)</option>
              <option value="es-ES-ElviraNeural">España - Elvira (Femenino)</option>
            </select>
          </label>
          <label className={`${labelCls} md:col-span-2`}>Objetivos<textarea name="goals" required rows={2} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>Frases habituales<textarea name="allowedPhrases" rows={2} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>Frases prohibidas<textarea name="forbiddenPhrases" rows={2} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>Ejemplo bueno<textarea name="goodExamples" rows={2} className={`${inputCls} resize-y`} /></label>
          <label className={labelCls}>Ejemplo prohibido<textarea name="badExamples" rows={2} className={`${inputCls} resize-y`} /></label>
          <div className="flex items-end justify-end md:col-span-2">
            <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">Agregar persona</button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Quinteto ({personas.length})</h2>
        <div className="mt-4 grid gap-3">
          {personas.map((p) => {
            const matches = PERSONA_NAME_SET.has(p.name);
            return (
              <form key={p.id} action={updatePersona} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="clientId" value={activeClient?.id ?? ""} />
                <label className={labelCls}>
                  Nombre {matches ? null : <span className="text-red-600">(no coincide con el router)</span>}
                  <input name="name" defaultValue={p.name} required className={`${inputCls} ${matches ? "" : "border-red-400"}`} />
                </label>
                <label className={labelCls}>Longitud preferida<input name="preferredLength" defaultValue={p.preferredLength} className={inputCls} /></label>
                <label className={labelCls}>Rol<input name="role" defaultValue={p.role} required className={inputCls} /></label>
                <label className={labelCls}>Tono<input name="tone" defaultValue={p.tone} required className={inputCls} /></label>
                 <label className={labelCls}>Avatar (Local: Ruta Video/Imagen o URL)<input name="avatarUrl" defaultValue={p.avatarUrl} placeholder="Ej: https://images.unsplash.com/... o D:\avatar.mp4" className={inputCls} /></label>
                <label className={labelCls}>Voz IA (Local Edge-TTS)
                  <select name="voiceId" defaultValue={p.voiceId} className={inputCls}>
                    <option value="es-AR-TomasNeural">Argentina - Tomás (Masculino)</option>
                    <option value="es-AR-ElenaNeural">Argentina - Elena (Femenino)</option>
                    <option value="es-MX-JorgeNeural">México - Jorge (Masculino)</option>
                    <option value="es-MX-DaliaNeural">México - Dalia (Femenino)</option>
                    <option value="es-ES-AlvaroNeural">España - Álvaro (Masculino)</option>
                    <option value="es-ES-ElviraNeural">España - Elvira (Femenino)</option>
                  </select>
                </label>
                <label className={`${labelCls} md:col-span-2`}>Objetivos<textarea name="goals" defaultValue={p.goals} required rows={2} className={`${inputCls} resize-y`} /></label>
                <label className={labelCls}>Frases habituales<textarea name="allowedPhrases" defaultValue={p.allowedPhrases} rows={2} className={`${inputCls} resize-y`} /></label>
                <label className={labelCls}>Frases prohibidas<textarea name="forbiddenPhrases" defaultValue={p.forbiddenPhrases} rows={2} className={`${inputCls} resize-y`} /></label>
                <label className={labelCls}>Ejemplo bueno<textarea name="goodExamples" defaultValue={p.goodExamples} rows={2} className={`${inputCls} resize-y`} /></label>
                <label className={labelCls}>Ejemplo prohibido<textarea name="badExamples" defaultValue={p.badExamples} rows={2} className={`${inputCls} resize-y`} /></label>
                <div className="flex items-end justify-between gap-2 md:col-span-2">
                  <span className="text-xs text-slate/60">{p._count.responses} respuestas</span>
                  <div className="flex gap-2">
                    <button className="rounded-full border border-ink/20 px-4 py-2 text-sm font-bold text-ink hover:bg-white">Guardar</button>
                    <button formAction={deletePersona} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Eliminar</button>
                  </div>
                </div>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}

