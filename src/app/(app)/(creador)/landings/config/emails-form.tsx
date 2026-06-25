"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";
const subHead = "mb-3 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate/40";

type EmailConfig = {
  id: string;
  fromName: string;
  fromEmail: string;
  labName: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPass: boolean;
  unsubscribeBaseUrl: string;
  trackBaseUrl: string;
};

export function EmailsForm({
  config,
  updateEmailConfig,
}: {
  config: EmailConfig;
  updateEmailConfig: (fd: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    await updateEmailConfig(fd);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={config.id} />

      <p className={subHead} style={{ marginTop: 0 }}>Quién envía</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          Nombre del remitente
          <span className={hintCls}>Lo que ve el destinatario como &quot;De:&quot;</span>
          <input name="fromName" defaultValue={config.fromName} placeholder="Bruno de PC MIDI Labs" className={inputCls} />
        </label>
        <label className={labelCls}>
          Email del remitente
          <input name="fromEmail" type="email" defaultValue={config.fromEmail} placeholder="bruno@pcmidicenter.com" className={inputCls} />
        </label>
        <label className={`${labelCls} md:col-span-2`}>
          Firma al pie del email
          <span className={hintCls}>Texto que aparece al final de cada email enviado.</span>
          <input name="labName" defaultValue={config.labName} placeholder="Bruno de PC MIDI Labs" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Servidor de salida (SMTP)</p>
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
          Usuario
          <input name="smtpUser" defaultValue={config.smtpUser} className={inputCls} />
        </label>
        <label className={labelCls}>
          Contraseña{" "}
          {config.hasSmtpPass ? <span className="font-normal text-emerald-600">✓ configurada</span> : <span className="font-normal text-slate/50">no configurada</span>}
          <input name="smtpPass" type="password" autoComplete="off" placeholder="en blanco = conservar la actual" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Tracking y baja</p>
      <div className="grid gap-4">
        <label className={labelCls}>
          URL para darse de baja
          <span className={hintCls}>Se agrega automáticamente al pie de cada email. Ej: https://blog.tudominio.com/api/unsubscribe/</span>
          <input name="unsubscribeBaseUrl" defaultValue={config.unsubscribeBaseUrl} className={inputCls} />
        </label>
        <label className={labelCls}>
          URL base para medir clicks
          <span className={hintCls}>Dominio de la app. Se usa para rastrear qué links se abren. Ej: https://blog.tudominio.com</span>
          <input name="trackBaseUrl" defaultValue={config.trackBaseUrl} className={inputCls} />
        </label>
      </div>

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
