import { redirect } from "next/navigation";

type PageProps = { searchParams: { client?: string } };

// Inicio es la bandeja de trabajo: no duplicamos un dashboard previo a las
// oportunidades. Conservamos el cliente seleccionado cuando se navega desde
// el selector global.
export default function HomePage({ searchParams }: PageProps) {
  const clientQuery = searchParams.client
    ? `?client=${encodeURIComponent(searchParams.client)}`
    : "";

  redirect(`/oportunidades${clientQuery}`);
}
