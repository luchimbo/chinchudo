"use client";

import { ARTICLE_LIMITS, type ArticleCheck, type ArticleDraft } from "@/lib/article-edit";

function Counter({ value, max }: { value: string; max: number }) {
  const length = value.trim().length;
  const tone = length > max ? "text-rose-700 font-semibold" : length > max * 0.9 ? "text-amber-700" : "text-slate";
  return <span className={`text-[11px] tabular-nums ${tone}`}>{length}/{max}</span>;
}

const fieldClass = "w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink focus:border-moss focus:outline-none";
const ICON: Record<ArticleCheck["level"], { mark: string; tone: string }> = {
  ok: { mark: "✓", tone: "text-emerald-700" },
  warning: { mark: "!", tone: "text-amber-700" },
  error: { mark: "✕", tone: "text-rose-700" },
};

export function SeoPanel({
  draft,
  onField,
  changed,
  url,
  checks,
  status,
}: {
  draft: ArticleDraft;
  onField: (field: "keyword" | "seoTitle" | "description", value: string) => void;
  changed: Set<string>;
  url: string;
  checks: ArticleCheck[];
  status: { label: string; date: string; tone: string; note?: string };
}) {
  const border = (id: string) => (changed.has(id) ? "border-amber-400 ring-1 ring-amber-200" : "border-ink/15");
  const displayUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/").join(" › ");
  return (
    <aside className="space-y-4 lg:sticky lg:top-4">
      <section className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
          <span className="text-xs text-slate">{status.date}</span>
        </div>
        {status.note ? <p className="mt-2 text-xs text-slate">{status.note}</p> : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-ink/10 bg-paper p-4 shadow-sm">
        <h2 className="font-display text-base text-ink">Búsqueda y SEO</h2>
        <label className="grid gap-1 text-xs font-semibold text-slate">
          <span className="flex justify-between">Búsqueda objetivo <Counter value={draft.keyword} max={ARTICLE_LIMITS.keyword} /></span>
          <input value={draft.keyword} onChange={(event) => onField("keyword", event.target.value)} className={`${fieldClass} ${border("keyword")}`} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate">
          <span className="flex justify-between">Título SEO <Counter value={draft.seoTitle} max={ARTICLE_LIMITS.seoTitle} /></span>
          <input value={draft.seoTitle} onChange={(event) => onField("seoTitle", event.target.value)} className={`${fieldClass} ${border("seoTitle")}`} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate">
          <span className="flex justify-between">Descripción SEO <Counter value={draft.description} max={ARTICLE_LIMITS.description} /></span>
          <textarea rows={3} value={draft.description} onChange={(event) => onField("description", event.target.value)} className={`${fieldClass} ${border("description")} resize-none`} />
        </label>
        <div className="rounded-xl border border-ink/10 bg-white p-3" aria-label="Vista previa en Google">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate/70">Así podría verse en Google</p>
          <p className="truncate text-xs text-[#4d5156]">{displayUrl}</p>
          <p className="truncate text-[17px] leading-snug text-[#1a0dab]">{draft.seoTitle || draft.h1 || "Título SEO"}</p>
          <p className="line-clamp-2 text-[13px] leading-snug text-[#4d5156]">{draft.description || "Descripción SEO"}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-sm">
        <h2 className="font-display text-base text-ink">Antes de guardar</h2>
        <ul className="mt-2 space-y-1.5">
          {checks.map((check) => (
            <li key={check.id} className="flex gap-2 text-xs leading-snug text-ink">
              <span aria-hidden className={`w-3 shrink-0 text-center font-bold ${ICON[check.level].tone}`}>{ICON[check.level].mark}</span>
              <span className={check.level === "ok" ? "text-slate" : ""}>{check.message}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate">Los puntos con ✕ impiden guardar; los de ! son recomendaciones.</p>
      </section>
    </aside>
  );
}
