"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };
export type NavGroup = { title?: string; items: NavItem[] };

// Una sola fuente de verdad de la navegación. Las rutas son sin ?client=;
// el shell agrega el cliente activo con withClient().
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/", label: "Inicio" }],
  },
  {
    title: "Oportunidades",
    items: [
      { href: "/oportunidades", label: "Pendientes" },
    ],
  },
  {
    title: "Contenido",
    items: [
      { href: "/landings/editor", label: "Editor" },
      { href: "/distribution", label: "Para publicar" },
      { href: "/actividad", label: "Publicado" },
    ],
  },
  {
    title: "Contactos",
    items: [
      { href: "/leads", label: "Contactos" },
    ],
  },
  {
    title: "Resultados",
    items: [
      { href: "/analytics", label: "Analítica & Informe" },
      { href: "/geo", label: "Presencia en IAs" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  withClient,
  onNavigate,
}: {
  withClient: (href: string) => string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.title ?? `g${i}`} className="flex flex-col gap-1">
          {group.title ? (
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate/45">
              {group.title}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={withClient(item.href)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[40px] items-center rounded-lg px-3 text-sm transition ${
                  active
                    ? "bg-ink/[0.06] font-semibold text-ink"
                    : "font-medium text-slate/70 hover:bg-ink/[0.03] hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
