import Link from "next/link";
import { prisma } from "@/lib/db";
import { getVisibleClients } from "@/lib/auth";
import { createClient, updateClient, clearApiKey } from "./actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const sectionHead = "mt-6 mb-2 border-t border-ink/10 pt-4 text-[11px] font-bold uppercase tracking-widest text-slate/60";

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
  return `configurada ····${key.slice(-4)}`;
}

function ClientForm({
  c,
  action,
  isNew = false,
}: {
  c: Partial<{
    id: string; name: string; slug: string; description: string;
    domainKeywords: string; domainExclusions: string;
    openrouterApiKey: string; openrouterModel: string;
    active: boolean; autoApprove: boolean; autoPublish: boolean;
    storeUrl: string; blogBaseUrl: string; labName: string; logoUrl: string;
    fromName: string; fromEmail: string; smtpHost: string; smtpPort: number;
    smtpUser: string; smtpPass: string; unsubscribeBaseUrl: string; trackBaseUrl: string;
  }>;
  action: (formData: FormData) => Promise<void>;
  isNew?: boolean;
}) {
  return (
    <form action={action} className="grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 md:grid-cols-2">
      {c.id && <input type="hidden" name="id" value={c.id} />}

      {/* Identidad */}
      <label className={labelCls}>
        Nombre {!isNew && (c.active ? <span className="text-moss">● activo</span> : <span className="text-slate/60">○ inactivo</span>)}
        <input name="name" defaultValue={c.name ?? ""} required className={inputCls} />
      </label>
      <label className={labelCls}>Slug<input name="slug" defaultValue={c.slug ?? ""} required placeholder="prestige-running" className={inputCls} /></label>
      <label className={`${labelCls} md:col-span-2`}>Descripción<input name="description" defaultValue={c.description ?? ""} className={inputCls} /></label>
      <label className={labelCls}>Keywords de dominio (una por línea)
        <textarea name="domainKeywords" defaultValue={listToText(c.domainKeywords ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
      </label>
      <label className={labelCls}>Exclusiones (una por línea)
        <textarea name="domainExclusions" defaultValue={listToText(c.domainExclusions ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
      </label>

      {/* IA */}
      <p className={`${sectionHead} md:col-span-2`}>OpenRouter / IA</p>
      <label className={labelCls}>
        API key {!isNew && <span className="font-normal text-slate/60">({maskKey(c.openrouterApiKey ?? "")})</span>}
        <input name="openrouterApiKey" type="password" autoComplete="off" placeholder={isNew ? "sk-or-…" : "en blanco = conservar"} className={inputCls} />
      </label>
      <label className={labelCls}>Modelo<input name="openrouterModel" defaultValue={c.openrouterModel ?? ""} placeholder="google/gemini-2.0-flash-lite" className={inputCls} /></label>

      {/* Branding / landings */}
      <p className={`${sectionHead} md:col-span-2`}>Branding &amp; landings</p>
      <label className={labelCls}>URL tienda<input name="storeUrl" defaultValue={c.storeUrl ?? ""} placeholder="https://www.pcmidi.com.ar" className={inputCls} /></label>
      <label className={labelCls}>URL blog base<input name="blogBaseUrl" defaultValue={c.blogBaseUrl ?? ""} placeholder="https://blog.pcmidicenter.com" className={inputCls} /></label>
      <label className={labelCls}>Nombre del lab<input name="labName" defaultValue={c.labName ?? ""} placeholder="PC MIDI Labs" className={inputCls} /></label>
      <label className={labelCls}>URL logo<input name="logoUrl" defaultValue={c.logoUrl ?? ""} placeholder="https://…/logo.png" className={inputCls} /></label>

      {/* Email / nurturing */}
      <p className={`${sectionHead} md:col-span-2`}>Email / nurturing (Fase 2)</p>
      <label className={labelCls}>Nombre remitente<input name="fromName" defaultValue={c.fromName ?? ""} placeholder="Bruno de PC MIDI Labs" className={inputCls} /></label>
      <label className={labelCls}>Email remitente<input name="fromEmail" defaultValue={c.fromEmail ?? ""} placeholder="lab@pcmidicenter.com" className={inputCls} /></label>
      <label className={labelCls}>SMTP host<input name="smtpHost" defaultValue={c.smtpHost ?? ""} placeholder="smtp.zoho.com" className={inputCls} /></label>
      <label className={labelCls}>SMTP puerto<input name="smtpPort" type="number" defaultValue={c.smtpPort ?? 465} className={inputCls} /></label>
      <label className={labelCls}>SMTP usuario<input name="smtpUser" defaultValue={c.smtpUser ?? ""} className={inputCls} /></label>
      <label className={labelCls}>
        SMTP contraseña {!isNew && c.smtpPass ? <span className="font-normal text-slate/60">(configurada)</span> : null}
        <input name="smtpPass" type="password" autoComplete="off" placeholder={isNew ? "" : "en blanco = conservar"} className={inputCls} />
      </label>
      <label className={`${labelCls} md:col-span-2`}>URL base unsubscribe<input name="unsubscribeBaseUrl" defaultValue={c.unsubscribeBaseUrl ?? ""} placeholder="https://blog.pcmidicenter.com/api/unsubscribe/" className={inputCls} /></label>
      <label className={`${labelCls} md:col-span-2`}>URL base tracking<input name="trackBaseUrl" defaultValue={c.trackBaseUrl ?? ""} placeholder="https://blog.pcmidicenter.com" className={inputCls} /></label>

      {/* Flags */}
      <div className="flex flex-wrap gap-4 md:col-span-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="active" defaultChecked={c.active ?? true} /> Activo</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoApprove" defaultChecked={c.autoApprove ?? false} /> Auto-aprobar</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate"><input type="checkbox" name="autoPublish" defaultChecked={c.autoPublish ?? false} /> Auto-publicar</label>
      </div>
      <div className="flex flex-wrap items-end justify-end gap-2 md:col-span-2">
        <button className="rounded-full bg-ink px-5 py-2 text-sm font-bold text-paper transition hover:bg-slate">
          {isNew ? "Crear cliente" : "Guardar"}
        </button>
        {!isNew && (c.openrouterApiKey) ? (
          <button formAction={clearApiKey} className="rounded-full border border-red-300 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50">Borrar API key</button>
        ) : null}
      </div>
    </form>
  );
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
            Dominio, branding, API key de OpenRouter y configuración de email por cliente.
          </p>
        </div>
        <Link href="/admin" className="rounded-full border border-ink/20 bg-white/50 px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/45 hover:bg-white">
          Volver
        </Link>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-2xl text-ink">Nuevo cliente</h2>
        <ClientForm c={{}} action={createClient} isNew />
      </section>

      <section>
        <h2 className="font-display text-2xl text-ink">Clientes ({clients.length})</h2>
        <div className="mt-4 grid gap-6">
          {clients.map((c) => (
            <ClientForm key={c.id} c={c} action={updateClient} />
          ))}
          {clients.length === 0 && <p className="rounded-md bg-paper p-4 text-sm text-slate">Sin clientes visibles.</p>}
        </div>
      </section>
    </main>
  );
}
