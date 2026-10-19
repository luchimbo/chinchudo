import { redirect } from "next/navigation";

/** Pantalla reemplazada por el Estudio de Reels. */
export default function LegacyRedirect({ searchParams }: { searchParams: { client?: string; firstUse?: string } }) {
  if (searchParams.firstUse === "opportunities") {
    const query = new URLSearchParams({ firstUse: "opportunities" });
    if (searchParams.client) query.set("client", searchParams.client);
    redirect(`/asistente-cm?${query}`);
  }
  const target = "/estudio/inspiracion";
  redirect(searchParams.client ? `${target}${target.includes("?") ? "&" : "?"}client=${encodeURIComponent(searchParams.client)}` : target);
}
