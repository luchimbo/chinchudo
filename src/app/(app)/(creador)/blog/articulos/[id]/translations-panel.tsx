"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoadingMessage } from "@/components/loading-ui";
import { BLOG_LANGUAGES, type BlogLanguage } from "@/lib/blog-language";
import { DeleteLandingButton } from "../../delete-landing-button";
import { requestArticleTranslations } from "./actions";

type Translation = { id: string; titulo: string; language: BlogLanguage; status: string };
type Pending = { language: BlogLanguage; error?: string };

const label = (language: BlogLanguage) => BLOG_LANGUAGES.find(item => item.value === language)?.label || language;

export function TranslationsPanel({ articleId, language, original, translations, pending, client, deleteRedirect }: {
  articleId: string;
  language: BlogLanguage;
  original: { id: string; titulo: string } | null;
  translations: Translation[];
  pending: Pending[];
  client: string;
  deleteRedirect: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const waiting = pending.some(item => !item.error);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => { if (!document.hidden) router.refresh(); }, 15_000);
    return () => clearInterval(timer);
  }, [router, waiting]);
  const taken = new Set<BlogLanguage>([language, ...translations.map(item => item.language), ...pending.filter(item => !item.error).map(item => item.language)]);
  const available = BLOG_LANGUAGES.filter(item => !taken.has(item.value));
  const href = (id: string) => `/blog/articulos/${id}?${new URLSearchParams({ client })}`;

  return (
    <section className="mt-6 grid gap-4 rounded-2xl border border-ink/10 bg-paper p-5 sm:grid-cols-[1fr_auto]">
      <div className="space-y-3">
        <h2 className="font-display text-lg text-ink">Idiomas</h2>
        {original ? (
          <p className="text-sm text-slate">Esta es la versión en {label(language).toLowerCase()} de <Link href={href(original.id)} className="font-semibold text-ink underline underline-offset-2">{original.titulo || "el artículo original"}</Link>. Se publica junto con el original.</p>
        ) : (
          <>
            <p className="text-sm text-slate">Original en {label(language).toLowerCase()}. Las traducciones dicen lo mismo, se enlazan entre sí (hreflang) y se publican junto con el original.</p>
            {translations.length || pending.length ? (
              <ul className="space-y-1 text-sm">
                {translations.map(item => <li key={item.id}><span className="font-semibold">{label(item.language)}:</span> <Link href={href(item.id)} className="underline underline-offset-2">{item.titulo || "Ver traducción"}</Link> <span className="text-xs text-slate">· {item.status === "PUBLISHED" ? "publicada" : "se publica con el original"}</span></li>)}
                {pending.map(item => <li key={item.language} className={item.error ? "text-signal" : "text-slate"}><span className="font-semibold">{label(item.language)}:</span> {item.error ? `No se pudo traducir (${item.error.slice(0, 160)}). Podés reintentar.` : <LoadingMessage>Traduciendo en el agente local…</LoadingMessage>}</li>)}
              </ul>
            ) : null}
            {available.length ? (
              <form className="flex flex-wrap items-center gap-3" onSubmit={async event => {
                event.preventDefault(); if (busy) return;
                const languages = new FormData(event.currentTarget).getAll("language").map(String);
                setBusy(true); setError("");
                try {
                  const result = await requestArticleTranslations(articleId, languages);
                  if (!result.ok) setError(result.error); else router.refresh();
                } catch { setError("No se pudo pedir la traducción. Reintentá."); }
                finally { setBusy(false); }
              }}>
                {available.map(item => <label key={item.value} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="language" value={item.value} defaultChecked />{item.label}</label>)}
                <button type="submit" disabled={busy} aria-busy={busy} className="rounded-lg bg-moss px-3 py-2 text-sm font-semibold text-paper disabled:cursor-wait disabled:opacity-60">{busy ? <LoadingMessage>Solicitando…</LoadingMessage> : "Traducir"}</button>
              </form>
            ) : null}
            {error ? <p role="alert" className="text-sm text-signal">{error}</p> : null}
          </>
        )}
      </div>
      <div className="self-end">
        <DeleteLandingButton id={articleId} redirectTo={deleteRedirect} translations={original ? 0 : translations.length} />
      </div>
    </section>
  );
}
