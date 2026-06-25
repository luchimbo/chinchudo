import { Suspense } from "react";
import { SectorTabs } from "@/components/sector-tabs";

const TABS = [
  { href: "/oportunidades", label: "Oportunidades" },
  { href: "/distribution", label: "Para publicar" },
  { href: "/bitacora", label: "Bitácora" },
  { href: "/historial", label: "Historial" },
  { href: "/redes/config", label: "Configuraciones" },
];

export default function RedesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Suspense>
        <SectorTabs tabs={TABS} />
      </Suspense>
      {children}
    </div>
  );
}
