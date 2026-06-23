"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type ClientOption = {
  slug: string;
  name: string;
};

export function ClientSwitcher({ clients, activeSlug }: { clients: ClientOption[]; activeSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.18em] text-slate/70">
      Cliente
      <select
        value={activeSlug}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("client", event.target.value);
          params.delete("page");
          router.replace(`${pathname}?${params.toString()}`);
        }}
        className="min-w-[190px] rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold text-ink"
      >
        {clients.map((client) => (
          <option key={client.slug} value={client.slug}>
            {client.name}
          </option>
        ))}
      </select>
    </label>
  );
}
