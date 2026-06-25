import { redirect } from "next/navigation";

type PageProps = {
  searchParams: Promise<{ [key: string]: string | undefined }>;
};

export default async function ActividadRedirectPage({ searchParams }: PageProps) {
  const params = new URLSearchParams(await searchParams as Record<string, string>);
  params.set("ver", "publicado");
  redirect(`/bitacora?${params.toString()}`);
}
