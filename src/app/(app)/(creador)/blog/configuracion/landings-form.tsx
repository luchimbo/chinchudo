"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoUpload } from "@/app/(app)/configuracion/logo-upload";
import { LoadingSpinner } from "@/components/loading-ui";
import { BLOG_LANGUAGES, type BlogLanguage } from "@/lib/blog-language";
import { dailyArticlePlan, MAX_DAILY_TOPICS } from "@/lib/blog-daily-plan.mjs";

const inputCls = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink w-full";
const labelCls = "grid gap-1 text-xs font-semibold text-slate";
const hintCls = "font-normal text-slate/60 text-[11px]";
const subHead = "mb-3 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate/40";

type Config = {
  id: string;
  clientSlug: string;
  blogLanguage?: BlogLanguage;
  blogComparisons?: boolean;
  editorialCalendar?: boolean;
  logoUrl: string;
  storeUrl: string;
  blogBaseUrl: string;
  autoApprove: boolean;
  autoPublish: boolean;
  generationSchedule: { enabled: boolean; intervalHours: number; limit: number; weeklyTarget: number };
  dailyBlogSchedule: { enabled: boolean; publishTime: string; autoApprove: boolean; articlePlan?: unknown };
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
  const [error, setError] = useState("");
  const [articlePlan, setArticlePlan] = useState(() => dailyArticlePlan(config.dailyBlogSchedule.articlePlan, config.blogLanguage));
  const dailyTotal = articlePlan.reduce((total, row) => total + row.length, 0);
  const usesCalendar = config.editorialCalendar ?? config.clientSlug === "pcmidi";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");
    const fd = new FormData(e.currentTarget);
    fd.set("logoUrl", logoUrl);
    try {
      await updateLandingsConfig(fd);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo guardar la configuración. Intentá de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <input type="hidden" name="id" value={config.id} />
      <label className={labelCls}>Idioma predeterminado de los artículos
        <select name="blogLanguage" defaultValue={config.blogLanguage || "es"} className={inputCls}>{BLOG_LANGUAGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <span className={hintCls}>Podés elegir otro idioma al generar cada artículo.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="blogComparisons" defaultChecked={config.blogComparisons} className="mt-1" />
        <span>Comparativas automáticas con otras marcas
          <span className={hintCls + " block"}>En los días para ayudar a elegir, se compara un producto propio con uno de otra marca. Las ventajas salen de las fichas verificadas; de la otra marca solo se indica qué revisar.</span>
        </span>
      </label>

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
          <input name="blogBaseUrl" defaultValue={config.blogBaseUrl} placeholder="https://prestige-landings.vercel.app" className={inputCls} />
        </label>
      </div>

      {!usesCalendar ? <>
      <p className={subHead}>Comportamiento</p>
      <div className="flex flex-col gap-3">
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" name="autoApprove" defaultChecked={config.autoApprove} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">Aprobar borradores automáticamente</span>
            <span className={`block ${hintCls}`}>Los artículos generados se aprueban sin revisión manual.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" name="autoPublish" defaultChecked={config.autoPublish} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">Publicar al aprobar automáticamente</span>
            <span className={`block ${hintCls}`}>Los artículos aprobados se publican en el blog sin confirmación.</span>
          </span>
        </label>
      </div>
      </> : null}

      {usesCalendar ? (
        <>
          <input type="hidden" name="generationIntervalHours" value={config.generationSchedule.intervalHours} />
          <input type="hidden" name="generationLimit" value={config.generationSchedule.limit} />
          <input type="hidden" name="weeklyTarget" value={config.generationSchedule.weeklyTarget} />
          <p className={subHead}>Calendario editorial</p>
          <div className="rounded-xl border border-moss/20 bg-moss/5 p-4">
            <label className="flex items-start gap-3 text-sm text-slate">
              <input type="checkbox" name="blogDailyEnabled" defaultChecked={config.dailyBlogSchedule.enabled} className="mt-0.5" />
              <span><span className="font-semibold text-ink">Activar publicación diaria</span><span className={`block ${hintCls}`}>Comienza al día siguiente de la activación.</span></span>
            </label>
            <input type="hidden" name="blogArticlePlan" value={JSON.stringify(articlePlan)} />
            <label className={`${labelCls} mt-4 max-w-xs`}>Temas distintos por día
              <input type="number" min="1" max={MAX_DAILY_TOPICS} value={articlePlan.length} onChange={event => {
                const count = Math.max(1, Math.min(MAX_DAILY_TOPICS, Number(event.target.value) || 1));
                setArticlePlan(previous => Array.from({ length: count }, (_, index) => previous[index] || [...previous[previous.length - 1]]));
              }} className={inputCls} />
              <span className={hintCls}>Cada tema genera el mismo artículo en los idiomas elegidos.</span>
            </label>
            <div className="mt-4 grid gap-3">
              {articlePlan.map((row, index) => <fieldset key={index} className="rounded-lg border border-ink/10 p-3">
                <legend className="px-1 text-xs font-semibold text-ink">Idiomas del tema {index + 1}</legend>
                <div className="flex flex-wrap gap-4">{BLOG_LANGUAGES.map(language => <label key={language.value} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={row.includes(language.value)} disabled={row.length === 1 && row.includes(language.value)} onChange={event => {
                    const checked = event.target.checked;
                    setArticlePlan(previous => previous.map((item, position) => position === index ? checked ? [...item, language.value] : item.filter(value => value !== language.value) : item));
                  }} />{language.label}
                </label>)}</div>
              </fieldset>)}
            </div>
            <p role="status" className="mt-3 text-sm font-semibold text-ink">{dailyTotal} {dailyTotal === 1 ? "artículo diario" : "artículos diarios"} · {articlePlan.length} {articlePlan.length === 1 ? "tema" : "temas"}</p>
            <p className={`${hintCls} mt-1`}>El primer idioma seleccionado se usa como original. Cada versión se puede editar por separado. Los cambios se aplican a las próximas fechas; los artículos ya preparados se conservan.</p>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate">
              <input type="checkbox" name="blogAutoApprove" defaultChecked={config.dailyBlogSchedule.autoApprove} className="mt-0.5" />
              <span><span className="font-semibold text-ink">Aprobar artículos automáticamente</span><span className={`block ${hintCls}`}>Incluye los borradores del análisis comercial. Solo se publican artículos que pasan los controles de calidad; los bloqueados quedan para revisión.</span></span>
            </label>
            <label className={`${labelCls} mt-4 max-w-xs`}>Hora de publicación en Argentina
              <input name="blogPublishTime" type="time" defaultValue={config.dailyBlogSchedule.publishTime} className={inputCls} />
              <span className={hintCls}>Indicá una hora antes de activar el calendario.</span>
            </label>
            <a href={`/blog/calendario?client=${encodeURIComponent(config.clientSlug)}`} className="mt-4 inline-block text-xs font-semibold text-moss underline underline-offset-2">Ver calendario editorial</a>
          </div>
        </>
      ) : (
      <>
      <p className={subHead}>Generación programada</p>
      <div className="rounded-xl border border-ink/10 bg-white/60 p-4">
        <label className="flex items-start gap-3 text-sm text-slate">
          <input type="checkbox" name="generationEnabled" defaultChecked={config.generationSchedule.enabled} className="mt-0.5" />
          <span>
            <span className="font-semibold text-ink">Generar artículos automáticamente</span>
            <span className={`block ${hintCls}`}>Combina ideas del conocimiento del cliente y preguntas detectadas en la web.</span>
          </span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={labelCls}>Cada cuántas horas
            <input name="generationIntervalHours" type="number" min="1" max="168" defaultValue={config.generationSchedule.intervalHours} className={inputCls} />
            <span className={hintCls}>Entre 1 hora y 7 días.</span>
          </label>
          <label className={labelCls}>Landings por corrida
            <input name="generationLimit" type="number" min="1" max="5" defaultValue={config.generationSchedule.limit} className={inputCls} />
            <span className={hintCls}>Entre 1 y 5 por corrida.</span>
          </label>
          <label className={labelCls}>Meta semanal
            <input name="weeklyTarget" type="number" min="2" max="10" defaultValue={config.generationSchedule.weeklyTarget} className={inputCls} />
            <span className={hintCls}>Hasta 10 por semana; el motor apunta a una mezcla 50/50 interna y externa.</span>
          </label>
        </div>
      </div>
      </>
      )}

      <div className="mt-6 flex items-center gap-4 border-t border-ink/10 pt-6">
        <button
          type="submit"
          disabled={saving}
          aria-busy={saving}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-bold text-paper transition hover:bg-slate disabled:opacity-60"
        >
          {saving ? <span role="status" className="inline-flex items-center gap-2"><LoadingSpinner />Guardando…</span> : "Guardar cambios"}
        </button>
        {saved ? <span className="text-xs font-semibold text-emerald-600">✓ Guardado</span> : null}
        {error ? <span role="alert" className="text-xs font-semibold text-red-700">{error}</span> : null}
      </div>
    </form>
  );
}
