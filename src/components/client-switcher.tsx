"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ClientOption = {
  slug: string;
  name: string;
};

// Color estable por slug (mismo cliente => mismo color), para distinguir de un vistazo.
const DOT_COLORS = ["#1D9E75", "#378ADD", "#D85A30", "#534AB7", "#D4537E", "#BA7517"];
function colorFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

export function ClientSwitcher({ clients, activeSlug }: { clients: ClientOption[]; activeSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = clients.find((c) => c.slug === activeSlug) ?? clients[0];

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-2 rounded-full border border-ink/15 bg-paper px-3 py-1.5 shadow-sm">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: active ? colorFor(active.slug) : "#888780" }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Cliente</span>
        <select
          value={active?.slug ?? ""}
          onChange={(event) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("client", event.target.value);
            params.delete("page");
            router.replace(`${pathname}?${params.toString()}`);
          }}
          className="bg-transparent text-sm font-bold text-ink outline-none"
        >
          {clients.map((client) => (
            <option key={client.slug} value={client.slug}>
              {client.name}
            </option>
          ))}
        </select>
      </div>
      {active && (
        <Link
          href={`/clients/${active.slug}`}
          title="Configurar cliente"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 bg-paper text-slate/50 shadow-sm transition hover:border-ink/30 hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      )}
    </div>
  );
}
