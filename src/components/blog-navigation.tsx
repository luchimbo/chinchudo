"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PendingNavigationLink as Link } from "./pending-navigation-link";

export function BlogNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => { if (menu.current) menu.current.open = false; }, [pathname, params]);
  if (!pathname.startsWith("/blog")) return null;
  const client = params.get("client");
  const suffix = client ? `?client=${encodeURIComponent(client)}` : "";
  const tools = [{ href: "/blog/fuentes", label: "Fuentes" }, { href: "/blog/diseno", label: "Diseño" }, { href: "/blog/configuracion", label: "Configuración" }];
  return <nav aria-label="Blog" className="flex min-w-0 items-center justify-between gap-3 border-b border-ink/10 bg-paper/80 px-3 sm:px-5">
    <div className="flex">{[{ href: "/blog/calendario", label: "Calendario" }, { href: "/blog/articulos", label: "Artículos" }].map(tab => {
      const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
      return <Link key={tab.href} href={tab.href + suffix} aria-current={active ? "page" : undefined} className={`border-b-2 px-3 py-3 text-sm ${active ? "border-ink font-semibold text-ink" : "border-transparent text-slate hover:text-ink"}`}>{tab.label}</Link>;
    })}</div>
    <details ref={menu} className="relative" onKeyDown={event => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
      <summary className={`cursor-pointer list-none rounded-lg px-3 py-2 text-sm hover:bg-ink/5 ${tools.some(tool => pathname.startsWith(tool.href)) ? "font-semibold text-ink" : "text-slate"}`}>Herramientas <span aria-hidden="true">⌄</span></summary>
      <div className="absolute right-0 top-full z-30 mt-1 min-w-44 rounded-xl border border-ink/10 bg-paper p-1.5 shadow-lg">{tools.map(tool => <Link key={tool.href} href={tool.href + suffix} aria-current={pathname.startsWith(tool.href) ? "page" : undefined} className="block rounded-lg px-3 py-2.5 text-sm text-ink hover:bg-ink/5">{tool.label}</Link>)}</div>
    </details>
  </nav>;
}
