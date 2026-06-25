"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoUpload } from "./logo-upload";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";
const sectionHead = "mt-8 mb-4 border-t border-ink/10 pt-6 text-[11px] font-bold uppercase tracking-widest text-slate/60";
const subHead = "mb-3 mt-5 text-[10px] font-bold uppercase tracking-widest text-slate/40";

type Config = {
  id: string;
  clientSlug: string;
  logoUrl: string;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassSet: boolean;
  unsubscribeBaseUrl: string;
  trackBaseUrl: string;
  labName: string;
  storeUrl: string;
  blogBaseUrl: string;
  autoApprove: boolean;
  autoPublish: boolean;
};

export function ConfigForm({ config, updateConfig }: { config: Config; updateConfig: (fd: FormData) => Promise<void> }) {
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState(config.logoUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    fd.set("logoUrl", logoUrl);
    await updateConfig(fd);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={config.id} />

      {/* ── Marca ── */}
      <p className={sectionHead} style={{ marginTop: 0, borderTop: "none" }}>Marca</p>
      <LogoUpload
        clientSlug={config.clientSlug}
        currentUrl={logoUrl}
        onUploaded={setLogoUrl}
      />

      {/* ── Emails automáticos ── */}
      <p className={sectionHead}>Emails automáticos</p>

      <p className={subHead}>Remitente</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          Nombre del remitente
          <input name="fromName" defaultValue={config.fromName} placeholder="Bruno de PC MIDI Labs" className={inputCls} />
        </label>
        <label className={labelCls}>
          Email del remitente
          <input name="fromEmail" type="email" defaultValue={config.fromEmail} placeholder="bruno@pcmidicenter.com" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Servidor SMTP</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          Servidor
          <input name="smtpHost" defaultValue={config.smtpHost} placeholder="smtp.zoho.com" className={inputCls} />
        </label>
        <label className={labelCls}>
          Puerto
          <input name="smtpPort" type="number" defaultValue={config.smtpPort} className={inputCls} />
        </label>
        <label className={labelCls}>
          Usuario SMTP
          <input name="smtpUser" defaultValue={config.smtpUser} className={inputCls} />
        </label>
        <label className={labelCls}>
          Contraseña SMTP{" "}
          {config.smtpPassSet ? <span className="font-normal text-slate/60">(configurada)</span> : null}
          <input name="smtpPass" type="password" autoComplete="off" placeholder="en blanco = conservar la actual" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Firma y tracking</p>
      <div className="grid gap-4">
        <label className={labelCls}>
          Firma del remitente
          <span className={hintCls}>Aparece al pie de cada email. Ej: Bruno de PC MIDI Labs</span>
          <input name="labName" defaultValue={config.labName} placeholder="Bruno de PC MIDI Labs" className={inputCls} />
        </label>
        <label className={labelCls}>
          URL para darse de baja
          <span className={hintCls}>Se incluye al pie de cada email. Ej: https://blog.tudominio.com/api/unsubscribe/</span>
          <input name="unsubscribeBaseUrl" defaultValue={config.unsubscribeBaseUrl} className={inputCls} />
        </label>
        <label className={labelCls}>
          URL base para medir clicks
          <span className={hintCls}>Dominio donde vive la app. Ej: https://blog.tudominio.com</span>
          <input name="trackBaseUrl" defaultValue={config.trackBaseUrl} className={inputCls} />
        </label>
      </div>

      {/* ── Landings ── */}
      <p className={sectionHead}>Landings</p>

      <p className={subHead}>URLs base</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          URL de la tienda
          <input name="storeUrl" defaultValue={config.storeUrl} placeholder="https://www.pcmidicenter.com.ar" className={inputCls} />
        </label>
        <label className={labelCls}>
          URL del blog
          <span className={hintCls}>Donde se publican los artículos generados.</span>
          <input name="blogBaseUrl" defaultValue={config.blogBaseUrl} placeholder="https://blog.pcmidicenter.com" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Comportamiento</p>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate">
          <input type="checkbox" name="autoApprove" defaultChecked={config.autoApprove} />
          Aprobar borradores automáticamente
          <span className={hintCls}>(sin revisión manual)</span>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate">
          <input type="checkbox" name="autoPublish" defaultChecked={config.autoPublish} />
          Publicar al aprobar automáticamente
        </label>
      </div>

      {/* Acciones */}
      <div className="mt-6 flex items-center gap-4 border-t border-ink/10 pt-6">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-paper transition hover:bg-slate disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved ? <span className="text-xs font-semibold text-emerald-600">✓ Guardado</span> : null}
      </div>
    </form>
  );
}
