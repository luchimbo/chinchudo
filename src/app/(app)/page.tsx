import { redirect } from "next/navigation";

type PageProps = { searchParams: { client?: string } };

// Inicio abre el panel general de métricas. Conservamos el cliente seleccionado
// cuando se navega desde el selector global.
export default function HomePage({ searchParams }: PageProps) {
  const clientQuery = searchParams.client
    ? `?client=${encodeURIComponent(searchParams.client)}`
    : "";

  redirect(`/analytics${clientQuery}`);
}
