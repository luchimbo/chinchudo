"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { opportunityStatuses, statusLabels, type OpportunityStatusValue } from "@/lib/labels";

type FilterBarProps = {
  channels: string[];
};

export function FilterBar({ channels }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const status = searchParams.get("status") ?? "";
  const channel = searchParams.get("channel") ?? "";
  const view = searchParams.get("view") ?? "";

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const firstRender = useRef(true);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // cualquier cambio de filtro vuelve a página 1
    // Si hay view activo, el selector de status no aplica (el view ya filtra por grupo)
    if (key !== "view") {
      const view = params.get("view");
      if (view) params.delete("status");
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  // Búsqueda con debounce
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handler = setTimeout(() => {
      setParam("q", query.trim());
    }, 300);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const hasActiveFilters = Boolean((!view && status) || channel || query);

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-ink/10 px-5 py-4">
      <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
        Estado
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          className="min-w-[150px] rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold text-ink"
        >
          <option value="">Todos</option>
          {opportunityStatuses.map((s) => (
            <option key={s} value={s}>
              {statusLabels[s as OpportunityStatusValue]}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
        Canal
        <select
          value={channel}
          onChange={(e) => setParam("channel", e.target.value)}
          className="min-w-[150px] rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold text-ink"
        >
          <option value="">Todos</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="grid flex-1 gap-1 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
        Búsqueda
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar en comentario o autor…"
          className="w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm font-medium text-ink placeholder:text-slate/50"
        />
      </label>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            router.replace(view ? `${pathname}?view=${view}` : pathname);
          }}
          className="h-9 rounded-full border border-ink/15 px-4 text-sm font-bold text-ink transition hover:border-ink/40 hover:bg-paper"
        >
          Limpiar
        </button>
      ) : null}
    </div>
  );
}
