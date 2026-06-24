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
        Nombre del cliente {!isNew && (c.active ? <span className="text-moss">● activo</span> : <span className="text-slate/60">○ inactivo</span>)}
        <input name="name" defaultValue={c.name ?? ""} required className={inputCls} />
      </label>
      <label className={labelCls}>
        Identificador interno
        <span className="font-normal text-slate/60 text-[11px]">Solo minúsculas y guiones. No se cambia después.</span>
        <input name="slug" defaultValue={c.slug ?? ""} required placeholder="prestige-running" className={inputCls} />
      </label>
      <label className={`${labelCls} md:col-span-2`}>
        Descripción breve
        <input name="description" defaultValue={c.description ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Temas del negocio (uno por línea)
        <span className="font-normal text-slate/60 text-[11px]">Palabras clave que definen el rubro. Los agentes las usan para no salirse del tema.</span>
        <textarea name="domainKeywords" defaultValue={listToText(c.domainKeywords ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
      </label>
      <label className={labelCls}>
        Temas a ignorar (uno por línea)
        <span className="font-normal text-slate/60 text-[11px]">El agente no generará contenido sobre estos temas aunque aparezcan relacionados.</span>
        <textarea name="domainExclusions" defaultValue={listToText(c.domainExclusions ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
      </label>

      {/* IA */}
      <p className={`${sectionHead} md:col-span-2`}>Inteligencia artificial</p>
      <label className={labelCls}>
        Clave de IA (OpenRouter) {!isNew && <span className="font-normal text-slate/60">({maskKey(c.openrouterApiKey ?? "")})</span>}
        <span className="font-normal text-slate/60 text-[11px]">Si queda vacía, se usa la clave global del sistema.</span>
        <input name="openrouterApiKey" type="password" autoComplete="off" placeholder={isNew ? "sk-or-…" : "en blanco = conservar la actual"} className={inputCls} />
      </label>
      <label className={labelCls}>
        Modelo de IA
        <span className="font-normal text-slate/60 text-[11px]">Modelo a usar para generar contenido de este cliente.</span>
        <input name="openrouterModel" defaultValue={c.openrouterModel ?? ""} placeholder="google/gemini-2.0-flash-lite" className={inputCls} />
      </label>

      {/* Sitio y marca */}
      <p className={`${sectionHead} md:col-span-2`}>Sitio web y marca</p>
      <label className={labelCls}>
        URL de la tienda
        <input name="storeUrl" defaultValue={c.storeUrl ?? ""} placeholder="https://www.prestigemedias.com.ar" className={inputCls} />
      </label>
      <label className={labelCls}>
        URL del blog
        <span className="font-normal text-slate/60 text-[11px]">Donde se publican los artículos generados.</span>
        <input name="blogBaseUrl" defaultValue={c.blogBaseUrl ?? ""} placeholder="https://blog.prestigemedias.com.ar" className={inputCls} />
      </label>
      <label className={labelCls}>
        Firma del autor
        <span className="font-normal text-slate/60 text-[11px]">Nombre que aparece al pie de cada artículo y email.</span>
        <input name="labName" defaultValue={c.labName ?? ""} placeholder="Equipo Prestige Running" className={inputCls} />
      </label>
      <label className={labelCls}>
        URL del logo
        <input name="logoUrl" defaultValue={c.logoUrl ?? ""} placeholder="https://…/logo.png" className={inputCls} />
      </label>

      {/* Email automático */}
      <p className={`${sectionHead} md:col-span-2`}>Emails automáticos a contactos</p>
      <label className={labelCls}>
        Nombre del remitente
        <input name="fromName" defaultValue={c.fromName ?? ""} placeholder="Lucas de Prestige Running" className={inputCls} />
      </label>
      <label className={labelCls}>
        Email del remitente
        <input name="fromEmail" defaultValue={c.fromEmail ?? ""} placeholder="lucas@prestigemedias.com.ar" className={inputCls} />
      </label>
      <label className={labelCls}>
        Servidor de correo saliente (host)
        <input name="smtpHost" defaultValue={c.smtpHost ?? ""} placeholder="smtp.zoho.com" className={inputCls} />
      </label>
      <label className={labelCls}>
        Puerto del servidor
        <input name="smtpPort" type="number" defaultValue={c.smtpPort ?? 465} className={inputCls} />
      </label>
      <label className={labelCls}>
        Usuario de correo
        <input name="smtpUser" defaultValue={c.smtpUser ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Contraseña de correo {!isNew && c.smtpPass ? <span className="font-normal text-slate/60">(configurada)</span> : null}
        <input name="smtpPass" type="password" autoComplete="off" placeholder={isNew ? "" : "en blanco = conservar la actual"} className={inputCls} />
      </label>
      <label className={`${labelCls} md:col-span-2`}>
        URL para darse de baja
        <span className="font-normal text-slate/60 text-[11px]">Se incluye al pie de cada email. Ej: https://blog.tudominio.com/api/unsubscribe/</span>
        <input name="unsubscribeBaseUrl" defaultValue={c.unsubscribeBaseUrl ?? ""} placeholder="https://blog.prestigemedias.com.ar/api/unsubscribe/" className={inputCls} />
      </label>
      <label className={`${labelCls} md:col-span-2`}>
        URL base para medir clicks en emails
        <span className="font-normal text-slate/60 text-[11px]">Dominio donde vive la app. Ej: https://blog.tudominio.com</span>
        <input name="trackBaseUrl" defaultValue={c.trackBaseUrl ?? ""} placeholder="https://blog.prestigemedias.com.ar" className={inputCls} />
      </label>

      {/* Comportamiento */}
      <div className="flex flex-wrap gap-5 md:col-span-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate">
          <input type="checkbox" name="active" defaultChecked={c.active ?? true} />
          Activo
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate">
          <input type="checkbox" name="autoApprove" defaultChecked={c.autoApprove ?? false} />
          Aprobar borradores automáticamente
          <span className="font-normal text-slate/60">(sin revisión manual)</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate">
          <input type="checkbox" name="autoPublish" defaultChecked={c.autoPublish ?? false} />
          Publicar al aprobar automáticamente
        </label>
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
            Configurá cada marca: su sitio, la firma del autor, los emails automáticos y el modelo de IA que usa para generar contenido.
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
