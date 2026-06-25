"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Sector = {
  id: string;
  href: string;
  label: string;
  paths: string[];
  icon: React.ReactNode;
};

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const FileTextIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const ShareIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const ChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

const GearIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const MAIN_SECTORS: Sector[] = [
  {
    id: "inicio",
    href: "/",
    label: "Inicio",
    paths: ["/"],
    icon: <HomeIcon />,
  },
  {
    id: "creador",
    href: "/landings",
    label: "Creador de landings",
    paths: ["/landings", "/leads"],
    icon: <FileTextIcon />,
  },
  {
    id: "redes",
    href: "/oportunidades",
    label: "Publicador en Redes",
    paths: ["/oportunidades", "/bitacora", "/historial", "/distribution", "/actividad", "/redes"],
    icon: <ShareIcon />,
  },
  {
    id: "analiticas",
    href: "/analytics",
    label: "Analíticas",
    paths: ["/analytics", "/informe", "/geo"],
    icon: <ChartIcon />,
  },
];

const CONFIG_PATHS = [
  "/configuracion", "/brands", "/products", "/personas", "/prompts", "/knowledge", "/clients",
];

function isSectorActive(pathname: string, sector: Sector): boolean {
  if (sector.id === "inicio") return pathname === "/";
  return sector.paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isConfigActive(pathname: string): boolean {
  return CONFIG_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function IconRail({ withClient }: { withClient: (href: string) => string }) {
  const pathname = usePathname();

  const railItem = (key: string, href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      key={key}
      href={withClient(href)}
      title={label}
      aria-label={label}
      className={`flex h-11 w-48 items-center justify-start px-3.5 gap-3 rounded-xl transition-all overflow-hidden ${
        active
          ? "bg-ink text-paper"
          : "text-slate/45 hover:bg-ink/[0.06] hover:text-ink"
      }`}
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
        {icon}
      </div>
      <span className="whitespace-nowrap text-sm font-semibold">
        {label}
      </span>
    </Link>
  );

  return (
    <nav className="flex h-full flex-col items-center py-3 w-full">
      <div className="flex flex-1 flex-col items-center gap-1.5 pt-1 w-full">
        {MAIN_SECTORS.map((sector) =>
          railItem(sector.id, sector.href, sector.label, sector.icon, isSectorActive(pathname, sector))
        )}
      </div>
      <div className="flex flex-col items-center gap-1.5 pb-1 w-full">
        {railItem("configuracion", "/configuracion", "Configuración", <GearIcon />, isConfigActive(pathname))}
      </div>
    </nav>
  );
}
