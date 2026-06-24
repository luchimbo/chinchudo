"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SidebarNav } from "./sidebar-nav";

type ClientOption = { slug: string; name: string };

// Color estable por slug (mismo cliente => mismo color), para distinguir de un vistazo.
const DOT_COLORS = ["#1D9E75", "#378ADD", "#D85A30", "#534AB7", "#D4537E", "#BA7517"];
function colorFor(slug: string): string {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return DOT_COLORS[h % DOT_COLORS.length];
}

export function AppShell({
  clients,
  userLabel,
  children,
}: {
  clients: ClientOption[];
  userLabel: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeSlug = searchParams.get("client") ?? clients[0]?.slug ?? "";
  const active = clients.find((c) => c.slug === activeSlug) ?? clients[0] ?? null;

  // Cada link del menú arrastra el cliente activo.
  const withClient = (href: string) => {
    if (!active) return href;
    return `${href}?client=${encodeURIComponent(active.slug)}`;
  };

  // Cerrar el drawer al cambiar de ruta.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Cerrar el drawer con Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const switchClient = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("client", slug);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  };

  const sidebarInner = (
    <div className="flex h-full flex-col gap-6 p-4">
      {/* Selector de cliente */}
      {active ? (
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-ink/15 bg-paper px-3 py-1.5 shadow-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(active.slug) }}
            />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate/60">Cliente</span>
            <select
              value={active.slug}
              onChange={(e) => switchClient(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-ink outline-none"
            >
              {clients.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Link
            href={`/clients/${active.slug}`}
            title="Configurar cliente"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-paper text-slate/50 shadow-sm transition hover:border-ink/30 hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      ) : null}

      {/* Navegación agrupada */}
      <div className="flex-1 overflow-y-auto">
        <SidebarNav withClient={withClient} onNavigate={() => setDrawerOpen(false)} />
      </div>

      {/* Footer: config + usuario + salir */}
      <div className="flex flex-col gap-1 border-t border-ink/10 pt-3">
        <Link
          href="/admin"
          className="flex min-h-[40px] items-center rounded-lg px-3 text-sm font-medium text-slate/70 transition hover:bg-ink/[0.03] hover:text-ink"
        >
          Configuración
        </Link>
        <div className="flex items-center justify-between gap-2 px-3 pt-1">
          {userLabel ? <span className="truncate text-xs text-slate/55">{userLabel}</span> : <span />}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs font-semibold text-slate/60 transition hover:text-signal"
            >
              Salir
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-dvh w-full">
      {/* Sidebar fija (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-ink/10 bg-paper/60 backdrop-blur lg:block">
        {sidebarInner}
      </aside>

      {/* Top bar (mobile) */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-ink/10 bg-paper/90 px-4 backdrop-blur lg:hidden">
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
        <span className="text-sm font-bold text-ink">{active?.name ?? "Suite"}</span>
      </div>

      {/* Drawer (mobile) */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-ink/10 bg-paper shadow-panel">
            {sidebarInner}
          </div>
        </div>
      ) : null}

      {/* Contenido */}
      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>
    </div>
  );
}
