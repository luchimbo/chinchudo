import { redirect } from "next/navigation";

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ client?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const q = sp.client ? `?client=${sp.client}` : "";
  redirect(`/configuracion${q}`);
}
