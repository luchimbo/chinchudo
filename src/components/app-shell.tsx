"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IconRail } from "./icon-rail";
import { ClientSwitcher } from "./client-switcher";

type ClientOption = { slug: string; name: string };

const SECTOR_LABEL: Array<{ paths: string[]; label: string }> = [
  { paths: ["/"], label: "Inicio" },
  { paths: ["/landings", "/leads"], label: "Creador de landings" },
  { paths: ["/oportunidades", "/bitacora", "/historial", "/distribution", "/actividad", "/redes"], label: "Publicador en Redes" },
  { paths: ["/analytics", "/informe", "/geo"], label: "Analíticas" },
  { paths: ["/configuracion", "/brands", "/products", "/personas", "/prompts", "/knowledge", "/clients"], label: "Configuración" },
];

function getSectorLabel(pathname: string): string {
  for (const s of SECTOR_LABEL) {
    if (s.paths.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)))) {
      return s.label;
    }
  }
  return "Suite";
}

const MOBILE_SECTORS = [
  { href: "/", label: "Inicio" },
  { href: "/landings/editor", label: "Creador de landings" },
  { href: "/oportunidades", label: "Publicador en Redes" },
  { href: "/analytics", label: "Analíticas" },
  { href: "/configuracion", label: "Configuración" },
];

export function AppShell({
  clients,
  userLabel,
  children,
}: {
  clients: ClientOption[];
  userLabel: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeSlug = searchParams.get("client") ?? clients[0]?.slug ?? "";
  const active = clients.find((c) => c.slug === activeSlug) ?? clients[0] ?? null;

  const withClient = (href: string) => {
    if (!active) return href;
    return `${href}?client=${encodeURIComponent(active.slug)}`;
  };

  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const sectorLabel = getSectorLabel(pathname);

  return (
    <div className="relative flex min-h-dvh w-full">
      {/* Icon rail — desktop only */}
      <div className="hidden w-56 shrink-0 lg:block" />
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden h-dvh w-56 flex-col border-r border-ink/10 bg-paper/90 backdrop-blur lg:flex">
        <div className="flex flex-1 flex-col overflow-hidden">
          <IconRail withClient={withClient} />
        </div>
        {/* Logout icon at bottom */}
        <div className="flex flex-col items-center pb-3 w-full">
          <form action="/api/auth/logout" method="POST" className="w-full flex justify-center">
            <button
              type="submit"
              title={userLabel ? `Salir (${userLabel})` : "Salir"}
              aria-label="Salir"
              className="flex h-11 w-48 items-center justify-start px-3.5 gap-3 rounded-xl text-slate/35 transition hover:bg-ink/[0.06] hover:text-signal overflow-hidden"
            >
              <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>
              <span className="whitespace-nowrap text-sm font-semibold text-slate/50">
                Salir
              </span>
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-ink/10 bg-paper/90 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink/15 text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <span className="text-sm font-bold text-ink">{sectorLabel}</span>
        </div>
        <ClientSwitcher clients={clients} />
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r border-ink/10 bg-paper shadow-panel">
            <div className="flex h-full flex-col gap-4 p-4">
              <ClientSwitcher clients={clients} />
              <nav className="flex flex-1 flex-col gap-1">
                {MOBILE_SECTORS.map((s) => (
                  <Link
                    key={s.href}
                    href={withClient(s.href)}
                    onClick={() => setDrawerOpen(false)}
                    className="flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-slate/70 transition hover:bg-ink/[0.03] hover:text-ink"
                  >
                    {s.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center justify-between border-t border-ink/10 px-3 pt-3">
                {userLabel ? <span className="truncate text-xs text-slate/55">{userLabel}</span> : <span />}
                <form action="/api/auth/logout" method="POST">
                  <button type="submit" className="text-xs font-semibold text-slate/60 transition hover:text-signal">
                    Salir
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Desktop: client switcher header */}
        <header className="sticky top-0 z-20 hidden h-12 items-center justify-end border-b border-ink/10 bg-paper/80 px-4 backdrop-blur lg:flex">
          <ClientSwitcher clients={clients} />
        </header>
        <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
      </div>
    </div>
  );
}
