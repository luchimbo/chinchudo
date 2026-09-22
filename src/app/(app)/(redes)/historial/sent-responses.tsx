export type SentResponseItem = {
  opportunityId: string;
  channel: string;
  // Link directo al comentario publicado si quedó registrado; si no, el post original.
  sourceUrl: string;
  respondedAt: string;
  responseText: string;
};

export function SentResponses({ items, emptyMessage }: { items: SentResponseItem[]; emptyMessage: string }) {
  if (items.length === 0) return <div className="px-5 py-12 text-center text-slate">{emptyMessage}</div>;

  return <div className="divide-y divide-ink/10">
    {items.map((item) => {
      const date = new Date(item.respondedAt).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
      return <article key={item.opportunityId} className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold text-slate/60">{item.channel} · {date}</p>
          <p className="whitespace-pre-wrap text-[15px] leading-7 text-ink">
            {item.responseText || <span className="italic text-slate/60">No quedó registrado el texto del comentario.</span>}
          </p>
        </div>
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center self-start rounded-full bg-ink px-5 text-sm font-bold text-paper transition hover:bg-slate">
          Abrir fuente ↗
        </a>
      </article>;
    })}
  </div>;
}
