import { redirect } from "next/navigation";

type PageProps = {
  searchParams: { [key: string]: string | undefined };
};

export default async function ActividadRedirectPage({ searchParams }: PageProps) {
  const params = new URLSearchParams(searchParams as Record<string, string>);
  params.set("ver", "publicado");
  redirect(`/bitacora?${params.toString()}`);
}
