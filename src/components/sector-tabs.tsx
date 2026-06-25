"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export type TabItem = { href: string; label: string };

function isTabActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Exact match OR sub-path, but avoid /landings matching /landings/editor as "Archivo"
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SectorTabs({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const client = searchParams.get("client");
  const q = client ? `?client=${encodeURIComponent(client)}` : "";

  // Find the most-specific active tab (longest href match wins)
  const activeHref = tabs
    .filter((t) => isTabActive(pathname, t.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex gap-0 border-b border-ink/10 bg-paper/80 backdrop-blur">
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={`${tab.href}${q}`}
            className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-ink font-semibold text-ink"
                : "border-transparent text-slate/55 hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
