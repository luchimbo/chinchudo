import { redirect } from "next/navigation";

/** Pantalla reemplazada por el Estudio de Reels. */
export default function LegacyRedirect({ searchParams }: { searchParams: { client?: string } }) {
  const target = "/estudio/inspiracion";
  redirect(searchParams.client ? `${target}${target.includes("?") ? "&" : "?"}client=${encodeURIComponent(searchParams.client)}` : target);
}
