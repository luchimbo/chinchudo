"use client";

import { useState } from "react";

export type SentResponseItem = {
  opportunityId: string;
  channel: string;
  sourceAuthor: string;
  sourceText: string;
  sourceUrl: string;
  // Link directo al comentario publicado, solo si quedó registrado al publicar.
  commentUrl: string;
  respondedAt: string;
  responseText: string;
};

function ExpandableText({ text, limit, className = "" }: { text: string; limit: number; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > limit;
  const shown = expanded || !isLong ? text : `${text.slice(0, limit).trimEnd()}…`;
  return <p className={className}>{shown}{isLong ? <button type="button" onClick={() => setExpanded((value) => !value)} className="ml-1.5 font-bold text-moss hover:text-ink">{expanded ? "Ver menos" : "Ver más"}</button> : null}</p>;
}

export function SentResponses({ items, emptyMessage }: { items: SentResponseItem[]; emptyMessage: string }) {
  if (items.length === 0) return <div className="px-5 py-12 text-center text-slate">{emptyMessage}</div>;

  return <div className="divide-y divide-ink/10">
    {items.map((item) => {
      const date = new Date(item.respondedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
      return <article key={item.opportunityId} className="px-5 py-5">
        <p className="mb-3 text-xs font-semibold text-slate/60">{item.channel} · {date}</p>

        <section className="rounded-xl border border-ink/10 bg-paper/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate/70">
              Respondiste a{item.sourceAuthor ? <span className="normal-case tracking-normal text-ink"> · {item.sourceAuthor}</span> : null}
            </p>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full border border-ink/20 bg-white px-3 text-xs font-bold text-ink transition hover:border-ink/40">
              Abrir fuente ↗
            </a>
          </div>
          <ExpandableText text={item.sourceText} limit={220} className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate" />
        </section>

        <div aria-hidden="true" className="ml-6 h-4 border-l-2 border-moss/30" />

        <section className="rounded-xl border-2 border-moss/30 bg-moss/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-moss">Tu comentario</p>
            {item.commentUrl ? <a href={item.commentUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-full bg-moss px-3 text-xs font-bold text-white transition hover:bg-moss/85">
              Ver mi comentario ↗
            </a> : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-ink">
            {item.responseText || <span className="italic text-slate/60">No quedó registrado el texto del comentario.</span>}
          </p>
        </section>
      </article>;
    })}
  </div>;
}
