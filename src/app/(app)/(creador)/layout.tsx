import { Suspense } from "react";
import { SectorTabs } from "@/components/sector-tabs";

const TABS = [
  { href: "/landings/editor", label: "Editor" },
  { href: "/landings", label: "Archivo" },
  { href: "/leads", label: "Contactos" },
  { href: "/landings/config", label: "Configuraciones" },
];

export default function CreadorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Suspense>
        <SectorTabs tabs={TABS} />
      </Suspense>
      {children}
    </div>
  );
}
