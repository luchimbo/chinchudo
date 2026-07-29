import { redirect } from "next/navigation";

type PageProps = { searchParams: { client?: string } };

// Ruta anterior. La cola de contenido propio ya no forma parte del flujo
// operativo diario, por eso volvemos a la bandeja de oportunidades.
export default function DistributionRedirectPage({ searchParams }: PageProps) {
  const clientQuery = searchParams.client
    ? `?client=${encodeURIComponent(searchParams.client)}`
    : "";

  redirect(`/oportunidades${clientQuery}`);
}
