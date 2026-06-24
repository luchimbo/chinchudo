import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { updateClient, clearApiKey } from "../actions";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const sectionHead = "mt-8 mb-3 border-t border-ink/10 pt-5 text-[11px] font-bold uppercase tracking-widest text-slate/60";
const hintCls = "font-normal text-slate/60 text-[11px]";

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

export default async function ClientSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const c = await prisma.client.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, description: true, active: true,
      autoApprove: true, autoPublish: true,
      domainKeywords: true, domainExclusions: true,
      openrouterApiKey: true, openrouterModel: true,
      storeUrl: true, blogBaseUrl: true, labName: true, logoUrl: true,
      fromName: true, fromEmail: true,
      smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true,
      unsubscribeBaseUrl: true, trackBaseUrl: true,
    },
  });

  if (!c) notFound();

  // Verificar acceso (lanza si no tiene permiso)
  try {
    await assertClientAccess(prisma, c.id);
  } catch {
    notFound();
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col px-5 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-slate hover:text-ink">← Dashboard</Link>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: c.active ? "#1D9E75" : "#aaa" }}
            />
            <h1 className="font-display text-3xl text-ink">{c.name}</h1>
          </div>
          <p className="mt-1 text-sm text-slate">{c.description || "Sin descripción"}</p>
        </div>
      </header>

      <form action={updateClient} className="grid gap-4">
        <input type="hidden" name="id" value={c.id} />

        {/* Identidad */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            Nombre del cliente
            <input name="name" defaultValue={c.name} required className={inputCls} />
          </label>
          <label className={labelCls}>
            Identificador interno
            <span className={hintCls}>Solo minúsculas y guiones.</span>
            <input name="slug" defaultValue={c.slug} required className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            Descripción breve
            <input name="description" defaultValue={c.description ?? ""} className={inputCls} />
          </label>
          <label className={labelCls}>
            Temas del negocio (uno por línea)
            <span className={hintCls}>Palabras clave que definen el rubro.</span>
            <textarea name="domainKeywords" defaultValue={listToText(c.domainKeywords ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
          </label>
          <label className={labelCls}>
            Temas a ignorar (uno por línea)
            <span className={hintCls}>El agente no generará contenido sobre estos temas.</span>
            <textarea name="domainExclusions" defaultValue={listToText(c.domainExclusions ?? "[]")} rows={4} className={`${inputCls} resize-y`} />
          </label>
        </div>

        {/* IA */}
        <p className={sectionHead}>Inteligencia artificial</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            Clave de IA <span className="font-normal text-slate/60">({maskKey(c.openrouterApiKey ?? "")})</span>
            <span className={hintCls}>Si queda vacía, se usa la clave global del sistema.</span>
            <input name="openrouterApiKey" type="password" autoComplete="off" placeholder="en blanco = conservar la actual" className={inputCls} />
          </label>
          <label className={labelCls}>
            Modelo de IA
            <span className={hintCls}>Modelo a usar para generar contenido.</span>
            <input name="openrouterModel" defaultValue={c.openrouterModel ?? ""} placeholder="google/gemini-2.0-flash-lite" className={inputCls} />
          </label>
        </div>

        {/* Sitio y marca */}
        <p className={sectionHead}>Sitio web y marca</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            URL de la tienda
            <input name="storeUrl" defaultValue={c.storeUrl ?? ""} placeholder="https://www.tutienda.com.ar" className={inputCls} />
          </label>
          <label className={labelCls}>
            URL del blog
            <span className={hintCls}>Donde se publican los artículos generados.</span>
            <input name="blogBaseUrl" defaultValue={c.blogBaseUrl ?? ""} placeholder="https://blog.tutienda.com.ar" className={inputCls} />
          </label>
          <label className={labelCls}>
            Firma del autor
            <span className={hintCls}>Nombre que aparece al pie de artículos y emails.</span>
            <input name="labName" defaultValue={c.labName ?? ""} placeholder="Equipo Prestige Running" className={inputCls} />
          </label>
          <label className={labelCls}>
            URL del logo
            <input name="logoUrl" defaultValue={c.logoUrl ?? ""} placeholder="https://…/logo.png" className={inputCls} />
          </label>
        </div>

        {/* Email */}
        <p className={sectionHead}>Emails automáticos a contactos</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelCls}>
            Nombre del remitente
            <input name="fromName" defaultValue={c.fromName ?? ""} placeholder="Lucas de Prestige Running" className={inputCls} />
          </label>
          <label className={labelCls}>
            Email del remitente
            <input name="fromEmail" defaultValue={c.fromEmail ?? ""} placeholder="lucas@tutienda.com.ar" className={inputCls} />
          </label>
          <label className={labelCls}>
            Servidor de correo saliente
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
            Contraseña de correo {c.smtpPass ? <span className="font-normal text-slate/60">(configurada)</span> : null}
            <input name="smtpPass" type="password" autoComplete="off" placeholder="en blanco = conservar la actual" className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            URL para darse de baja
            <span className={hintCls}>Se incluye al pie de cada email. Ej: https://blog.tudominio.com/api/unsubscribe/</span>
            <input name="unsubscribeBaseUrl" defaultValue={c.unsubscribeBaseUrl ?? ""} className={inputCls} />
          </label>
          <label className={`${labelCls} md:col-span-2`}>
            URL base para medir clicks en emails
            <span className={hintCls}>Dominio donde vive la app. Ej: https://blog.tudominio.com</span>
            <input name="trackBaseUrl" defaultValue={c.trackBaseUrl ?? ""} className={inputCls} />
          </label>
        </div>

        {/* Comportamiento */}
        <p className={sectionHead}>Comportamiento</p>
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate">
            <input type="checkbox" name="active" defaultChecked={c.active ?? true} />
            Activo
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate">
            <input type="checkbox" name="autoApprove" defaultChecked={c.autoApprove ?? false} />
            Aprobar borradores automáticamente
            <span className={hintCls}>(sin revisión manual)</span>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate">
            <input type="checkbox" name="autoPublish" defaultChecked={c.autoPublish ?? false} />
            Publicar al aprobar automáticamente
          </label>
        </div>

        {/* Acciones */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-6">
          <button type="submit" className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-paper transition hover:bg-slate">
            Guardar cambios
          </button>
          {c.openrouterApiKey ? (
            <button formAction={clearApiKey} className="rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              Borrar clave de IA
            </button>
          ) : null}
          <Link href="/" className="ml-auto text-sm text-slate hover:text-ink">
            Cancelar
          </Link>
        </div>
      </form>
    </main>
  );
}
