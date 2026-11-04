"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
export type SearchItem = { id: string; name: string; brand: string; category: string };
export function useCatalogSearch(kind: string, query: string, enabled: boolean, clientOverride?: string, selected: string[] = []) {
  const params = useSearchParams();
  const client = clientOverride || params.get("client") || "";
  const [items, setItems] = useState<SearchItem[]>([]), [page, setPage] = useState(1), [more, setMore] = useState(false);
  const selectedKey = selected.join(",");
  const previous = useRef("");
  useEffect(() => { setPage(1); setItems([]); }, [client, kind, query]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const key = `${client}|${kind}|${query}`;
      try {
        const q = new URLSearchParams({ client, kind, q: query, page: String(page), selected: selectedKey });
        const response = await fetch(`/api/catalog/search?${q}`, { signal: controller.signal });
        if (!response.ok) return;
        const result = await response.json();
        if (controller.signal.aborted) return;
        setItems(current => page > 1 && previous.current === key ? [...new Map([...current, ...result.items].map(i => [i.id, i])).values()] : result.items);
        previous.current = key; setMore(result.hasMore);
      } catch { /* Preserve selected options on transient failure. */ }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, kind, query, enabled, page, selectedKey]);
  return { items, hasMore: more, loadMore: () => setPage(value => value + 1) };
}
