"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoUpload } from "@/app/(app)/configuracion/logo-upload";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";
const subHead = "mb-3 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate/40";

type Config = {
  id: string;
  clientSlug: string;
  logoUrl: string;
  storeUrl: string;
  blogBaseUrl: string;
  autoApprove: boolean;
  autoPublish: boolean;
};

export function LandingsForm({
  config,
  updateLandingsConfig,
}: {
  config: Config;
  updateLandingsConfig: (fd: FormData) => Promise<void>;
}) {
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
    await updateLandingsConfig(fd);
    setSaving(false);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={config.id} />

      <p className={subHead} style={{ marginTop: 0 }}>Logo</p>
      <p className="text-xs text-slate/60 -mt-2">
        Se usa en todas las landings generadas y en los emails automáticos.
      </p>
      <LogoUpload
        clientSlug={config.clientSlug}
        currentUrl={logoUrl}
        onUploaded={setLogoUrl}
      />

      <p className={subHead}>URLs base</p>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelCls}>
          URL de la tienda
          <span className={hintCls}>Se usa como destino principal de los CTAs.</span>
          <input name="storeUrl" defaultValue={config.storeUrl} placeholder="https://www.pcmidicenter.com.ar" className={inputCls} />
        </label>
        <label className={labelCls}>
          URL del blog
          <span className={hintCls}>Donde se publican los artículos generados.</span>
          <input name="blogBaseUrl" defaultValue={config.blogBaseUrl} placeholder="https://blog.pcmidicenter.com" className={inputCls} />
        </label>
      </div>

      <p className={subHead}>Comportamiento</p>
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" name="autoApprove" defaultChecked={config.autoApprove} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">Aprobar borradores automáticamente</span>
            <span className={`block ${hintCls}`}>Las landings generadas se aprueban sin revisión manual.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" name="autoPublish" defaultChecked={config.autoPublish} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">Publicar al aprobar automáticamente</span>
            <span className={`block ${hintCls}`}>Las landings aprobadas se publican en el blog sin confirmación.</span>
          </span>
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
