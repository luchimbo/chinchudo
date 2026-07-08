"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

const CHANNELS = ["instagram", "tiktok", "youtube", "facebook", "reddit", "x", "linkedin"] as const;
const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X / Twitter",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};
const LANGUAGES = [
  { value: "es", label: "Espanol" },
  { value: "en", label: "Ingles" },
  { value: "pt", label: "Portugues" },
  { value: "any", label: "Cualquiera" },
] as const;

type SearchEvent = {
  status: string;
  channel?: string;
  message?: string;
  data?: Record<string, any>;
};

type Props = {
  clientId: string;
  initialQuery: string;
  suggestions?: string[];
};

function uniqueKeywords(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function ManualOpportunitySearch({ clientId, initialQuery }: Props) {
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywords, setKeywords] = useState<string[]>(() => (
    uniqueKeywords(initialQuery.split(/\s+/)).slice(0, 3)
  ));
  const [language, setLanguage] = useState("es");
  const [limit, setLimit] = useState(5);
  const [channels, setChannels] = useState<string[]>(["instagram"]);
  const [events, setEvents] = useState<SearchEvent[]>([]);
  const [jobId, setJobId] = useState("");
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    const done = [...events].reverse().find((event) => event.status === "done")?.data;
    return {
      itemsRead: Number(done?.itemsRead || 0),
      createdOrProcessed: Number(done?.createdOrProcessed || 0),
      duplicates: Number(done?.duplicates || 0),
      discarded: Number(done?.discarded || 0),
      completedChannels: Number(done?.completedChannels || 0),
      timedOutChannels: Number(done?.timedOutChannels || 0),
      errors: Number(done?.errors || 0),
      attemptedSearches: Number(done?.attemptedSearches || 0),
      totalSearches: Number(done?.totalSearches || 0),
    };
  }, [events]);

  const activeEvent = [...events].reverse().find((event) => (
    event.status === "channel_started" || event.status === "import_started"
  ));

  useEffect(() => {
    if (!jobId || !running) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/opportunities/search/jobs?id=${encodeURIComponent(jobId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        if (cancelled) return;
        setEvents(data.job.events || []);
        if (data.job.status === "done" || data.job.status === "error") {
          setRunning(false);
        }
      } catch {
        if (cancelled) return;
        setEvents((current) => [
          ...current,
          {
            status: "error",
            message: "No pude actualizar el progreso, pero la busqueda sigue en segundo plano.",
          },
        ]);
      }
    };
    void poll();
    const timer = setInterval(poll, 2_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [jobId, running]);

  const toggleChannel = (channel: string) => {
    setChannels((current) => (
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel]
    ));
  };

  const runSearch = () => {
    if (!clientId || channels.length === 0 || running) return;
    const finalKeywords = [...keywords];
    const pending = keywordDraft.trim();
    if (pending && !finalKeywords.some((item) => item.toLowerCase() === pending.toLowerCase())) {
      finalKeywords.push(pending);
      setKeywords(finalKeywords);
      setKeywordDraft("");
    }
    const finalQuery = finalKeywords.join(" ");
    startTransition(async () => {
      setRunning(true);
      setOpen(true);
      setEvents([]);
      setJobId("");
      try {
        const response = await fetch("/api/opportunities/search/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, channels, query: finalQuery, queries: finalKeywords, language, limit }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "No se pudo iniciar la busqueda.");
        }
        const data = await response.json();
        setJobId(data.jobId);
        setEvents(data.job?.events || []);
      } catch (error) {
        setEvents((current) => [
          ...current,
          { status: "error", message: error instanceof Error ? error.message : "Error inesperado." },
        ]);
        setRunning(false);
      }
    });
  };

  const addKeyword = () => {
    const value = keywordDraft.trim();
    if (!value) return;
    setKeywords((current) => (
      current.some((item) => item.toLowerCase() === value.toLowerCase()) ? current : [...current, value]
    ));
    setKeywordDraft("");
  };

  const removeKeyword = (value: string) => {
    setKeywords((current) => current.filter((item) => item.toLowerCase() !== value.toLowerCase()));
  };

  const noResults = events.some((event) => event.status === "done") && totals.createdOrProcessed === 0;
  const statusStyle = (status: string) => {
    if (status === "queued") {
      return { dot: "h-3 w-3 bg-slate/50", text: "text-slate", label: "En segundo plano" };
    }
    if (status === "channel_started" || status === "import_started") {
      return {
        dot: "h-3 w-3 border-2 border-ink/20 border-t-ink bg-transparent animate-spin",
        text: "text-ink",
        label: status === "import_started" ? "Importando" : "Buscando",
      };
    }
    if (status === "listen_done" || status === "import_done") {
      return { dot: "h-3 w-3 bg-green-600", text: "text-slate", label: "Listo" };
    }
    if (status === "channel_empty") {
      return { dot: "h-3 w-3 bg-amber-400", text: "text-amber-800", label: "Sin candidatos" };
    }
    if (status === "channel_timeout") {
      return { dot: "h-3 w-3 bg-amber-500", text: "text-amber-800", label: "Tiempo agotado" };
    }
    if (status === "error") {
      return { dot: "h-3 w-3 bg-red-500", text: "text-red-700", label: "Error" };
    }
    if (status === "done") {
      return { dot: "h-3 w-3 bg-green-700", text: "text-ink", label: "Finalizado" };
    }
    return { dot: "h-3 w-3 bg-slate/50", text: "text-slate", label: "Info" };
  };

  return (
    <section className="mb-10 min-w-0 overflow-hidden rounded-lg border border-ink/10 bg-white/75 shadow-panel">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center justify-between gap-4 px-3 py-3 text-left transition hover:bg-paper/70 sm:px-4"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="font-display text-2xl text-ink">Nuevas oportunidades...</h2>
          <p className="mt-1 text-sm text-slate">
            {running ? "Busqueda corriendo en segundo plano." : "Toca para buscar oportunidades en redes."}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-3">
          {running ? <span className="h-4 w-4 rounded-full border-2 border-ink/20 border-t-ink animate-spin" /> : null}
          <span className={`text-xl font-bold text-ink transition-transform duration-300 ${open ? "rotate-180" : ""}`}>⌄</span>
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-ink/10 p-3 sm:p-4">
      {running ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 bg-paper px-3 py-3 text-sm text-ink">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink/40" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-ink" />
          </span>
          <span className="font-bold">Buscando oportunidades en segundo plano...</span>
          <span className="text-slate">Si un intento tarda mas de 20s, saltamos al siguiente.</span>
          {totals.totalSearches > 0 ? (
            <span className="font-bold text-slate">{totals.attemptedSearches}/{totals.totalSearches} busquedas</span>
          ) : null}
          {activeEvent?.channel ? (
            <span className="text-slate">Ahora: {CHANNEL_LABELS[activeEvent.channel as keyof typeof CHANNEL_LABELS] ?? activeEvent.channel}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_160px_120px]">
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate">
          Palabras clave
          <div className="min-w-0 rounded-md border border-ink/15 bg-paper px-2 py-2">
            <div className="mb-2 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <button
                  key={keyword}
                  type="button"
                  onClick={() => removeKeyword(keyword)}
                  className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-bold text-ink transition hover:border-red-300 hover:text-red-600"
                  title="Quitar palabra clave"
                >
                  {keyword} ×
                </button>
              ))}
            </div>
            <input
              value={keywordDraft}
              onChange={(event) => setKeywordDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addKeyword();
                }
              }}
              onBlur={addKeyword}
              placeholder="Escribi una palabra clave y apreta Enter"
              className="min-w-0 w-full border-0 bg-transparent px-1 py-1 text-sm text-ink outline-none"
            />
          </div>
          <span className="text-xs font-medium text-slate/70">
            Cada burbuja se busca por separado en cada red. Toca una burbuja para quitarla.
          </span>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate">
          Idioma
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="min-w-0 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
          >
            {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate">
          Cantidad por red
          <input
            value={limit}
            onChange={(event) => setLimit(Math.max(1, Math.min(20, Number(event.target.value) || 1)))}
            type="number"
            min={1}
            max={20}
            className="min-w-0 w-full rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate">Redes donde buscar</p>
          <p className="text-xs font-semibold text-slate/70">{channels.length} seleccionada{channels.length === 1 ? "" : "s"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {CHANNELS.map((channel) => {
            const selected = channels.includes(channel);
            return (
              <button
                key={channel}
                type="button"
                onClick={() => toggleChannel(channel)}
                className={`flex h-10 items-center justify-between rounded-md border px-3 text-sm font-bold transition ${
                  selected ? "border-ink bg-ink text-paper" : "border-ink/15 bg-paper text-slate hover:border-ink/35 hover:bg-white"
                }`}
                aria-pressed={selected}
              >
                <span>{CHANNEL_LABELS[channel]}</span>
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "border-paper bg-paper" : "border-ink/25"}`}>
                  {selected ? <span className="h-2 w-2 rounded-sm bg-ink" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={runSearch}
          disabled={running || isPending || channels.length === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-bold text-paper transition hover:bg-slate disabled:cursor-not-allowed disabled:bg-ink/35 sm:w-auto"
        >
          {running ? <span className="h-4 w-4 rounded-full border-2 border-paper/30 border-t-paper animate-spin" /> : null}
          {running ? "Buscando..." : "Buscar ahora"}
        </button>
      </div>

      {events.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-lg border border-ink/10 bg-paper">
          <div className="grid grid-cols-2 gap-2 border-b border-ink/10 px-3 py-3 text-center text-xs font-bold text-slate sm:grid-cols-4 sm:px-4">
            <span>{totals.itemsRead} leidos</span>
            <span>{totals.createdOrProcessed} procesadas</span>
            <span>{totals.duplicates} duplicadas</span>
            <span>{totals.discarded} descartadas</span>
          </div>
          {totals.totalSearches > 0 ? (
            <div className="border-b border-ink/10 px-3 py-2 text-center text-xs font-semibold text-slate">
              {totals.attemptedSearches}/{totals.totalSearches} busquedas ejecutadas. Muchas burbujas + muchas redes tarda mas.
            </div>
          ) : null}
          {(totals.completedChannels > 0 || totals.timedOutChannels > 0 || totals.errors > 0) ? (
            <div className="grid grid-cols-3 gap-2 border-b border-ink/10 px-3 py-2 text-center text-xs font-semibold text-slate">
              <span>{totals.completedChannels} redes listas</span>
              <span>{totals.timedOutChannels} con demora</span>
              <span>{totals.errors} errores</span>
            </div>
          ) : null}
          <div className="max-h-64 overflow-auto px-4 py-3">
            {events.map((event, index) => {
              const style = statusStyle(event.status);
              return (
                <div key={`${event.status}-${index}`} className="flex gap-3 border-b border-ink/5 py-2 text-sm last:border-0">
                  <span className={`mt-1 shrink-0 rounded-full ${style.dot}`} />
                  <div className="min-w-0">
                    <p className={style.text}>
                      {event.channel ? <span className="font-bold text-ink">{CHANNEL_LABELS[event.channel as keyof typeof CHANNEL_LABELS] ?? event.channel}: </span> : null}
                      {event.message || event.status}
                    </p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate/50">{style.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {noResults ? (
            <div className="border-t border-ink/10 px-4 py-3 text-sm text-slate">
              No entraron oportunidades nuevas. Proba con menos burbujas, una keyword mas amplia, o deja solo la red mas probable.
            </div>
          ) : null}
        </div>
      ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
