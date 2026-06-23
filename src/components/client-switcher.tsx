"use client";

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
  );
}
