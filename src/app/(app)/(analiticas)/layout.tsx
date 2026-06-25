import { Suspense } from "react";
import { SectorTabs } from "@/components/sector-tabs";

const TABS = [
  { href: "/analytics", label: "Analítica" },
  { href: "/informe", label: "Informe" },
  { href: "/geo", label: "Presencia en IAs" },
];

export default function AnaliticasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <Suspense>
        <SectorTabs tabs={TABS} />
      </Suspense>
      {children}
    </div>
  );
}
