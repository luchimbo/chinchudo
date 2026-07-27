import { redirect } from "next/navigation";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: { client?: string };
}) {
  const sp = searchParams ?? {};
  const q = sp.client ? `?client=${sp.client}` : "";
  redirect(`/configuracion${q}`);
}
