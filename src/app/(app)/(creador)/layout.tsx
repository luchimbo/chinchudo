import { Suspense } from "react";
import { SectorTabs } from "@/components/sector-tabs";

const TABS = [
  { href: "/blog", label: "Artículos" },
  { href: "/blog/calendario", label: "Calendario" },
  { href: "/blog/fuentes", label: "Fuentes" },
  { href: "/blog/diseno", label: "Diseño" },
  { href: "/leads", label: "Contactos" },
  { href: "/blog/configuracion", label: "Configuración" },
];

export default function CreadorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Suspense>
        <SectorTabs tabs={TABS} loadingFeedback />
      </Suspense>
      {children}
    </div>
  );
}
