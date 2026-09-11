import { excludeInternalLink, pinInternalLink, resetInternalLink } from "./actions";

export type EditorialLink = {
  targetId: string;
  targetTitle: string;
  anchorText: string;
  mode: "AUTO" | "PINNED" | "EXCLUDED";
};

export type LinkCandidate = { id: string; title: string; clusterName: string };

const MODE_LABEL: Record<EditorialLink["mode"], string> = {
  AUTO: "Automático",
  PINNED: "Fijado",
  EXCLUDED: "Excluido",
};

const MODE_CLASS: Record<EditorialLink["mode"], string> = {
  AUTO: "bg-ink/5 text-slate",
  PINNED: "bg-moss/10 text-moss",
  EXCLUDED: "bg-signal/10 text-signal line-through",
};

const smallButton = "rounded border px-2 py-0.5 text-[11px] font-semibold transition";

/**
 * Editor de relaciones de un artículo. Fijar o excluir crea una decisión
 * manual que el recálculo automático no sobrescribe; "Automático" la borra.
 */
export function InternalLinksEditor({
  sourceId,
  links,
  candidates,
}: {
  sourceId: string;
  links: EditorialLink[];
  candidates: LinkCandidate[];
}) {
  const linkedIds = new Set(links.map((link) => link.targetId));
  const available = candidates.filter((candidate) => candidate.id !== sourceId && !linkedIds.has(candidate.id));

  return (
    <details className="mt-3 rounded-lg border border-ink/10 bg-white/40 p-3 text-xs">
      <summary className="cursor-pointer font-semibold text-ink">Editar enlaces internos ({links.filter((link) => link.mode !== "EXCLUDED").length})</summary>
      <p className="mt-2 text-slate">Los cambios se aplican en el próximo build del blog. Los enlaces fijados o excluidos se respetan en cada recálculo.</p>
      {links.length === 0 ? <p className="mt-2 text-slate">Todavía no tiene enlaces salientes.</p> : null}
      <ul className="mt-2 flex flex-col gap-2">
        {links.map((link) => (
          <li key={link.targetId} className="flex flex-wrap items-center gap-2 border-t border-ink/5 pt-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${MODE_CLASS[link.mode]}`}>{MODE_LABEL[link.mode]}</span>
            <span className="min-w-0 flex-1 truncate text-ink" title={link.targetTitle}>{link.targetTitle}</span>
            {link.mode !== "EXCLUDED" ? (
              <form action={pinInternalLink} className="flex items-center gap-1">
                <input type="hidden" name="sourceId" value={sourceId} />
                <input type="hidden" name="targetId" value={link.targetId} />
                <input
                  name="anchorText"
                  defaultValue={link.anchorText}
                  maxLength={180}
                  aria-label="Texto del enlace"
                  className="w-48 rounded border border-ink/15 bg-paper px-2 py-0.5 text-[11px]"
                />
                <button type="submit" className={`${smallButton} border-moss/40 text-moss hover:bg-moss/10`}>
                  {link.mode === "PINNED" ? "Guardar" : "Fijar"}
                </button>
              </form>
            ) : null}
            {link.mode !== "EXCLUDED" ? (
              <form action={excludeInternalLink}>
                <input type="hidden" name="sourceId" value={sourceId} />
                <input type="hidden" name="targetId" value={link.targetId} />
                <button type="submit" className={`${smallButton} border-signal/40 text-signal hover:bg-signal/10`}>Excluir</button>
              </form>
            ) : null}
            {link.mode !== "AUTO" ? (
              <form action={resetInternalLink}>
                <input type="hidden" name="sourceId" value={sourceId} />
                <input type="hidden" name="targetId" value={link.targetId} />
                <button type="submit" className={`${smallButton} border-ink/20 text-slate hover:border-ink/40`}>Automático</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {available.length ? (
        <form action={pinInternalLink} className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-3">
          <input type="hidden" name="sourceId" value={sourceId} />
          <select name="targetId" required aria-label="Artículo a enlazar" className="max-w-xs rounded border border-ink/15 bg-paper px-2 py-1 text-[11px]">
            {available.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.clusterName} · {candidate.title}
              </option>
            ))}
          </select>
          <input name="anchorText" placeholder="Texto del enlace (opcional)" maxLength={180} className="w-56 rounded border border-ink/15 bg-paper px-2 py-1 text-[11px]" />
          <button type="submit" className={`${smallButton} border-moss/40 text-moss hover:bg-moss/10`}>Agregar enlace fijo</button>
        </form>
      ) : null}
    </details>
  );
}
