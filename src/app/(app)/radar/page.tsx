import { redirect } from "next/navigation";

/** Ruta histórica: las oportunidades viven en el Asistente CM. */
export default function LegacyRedirect({ searchParams }: { searchParams: { client?: string; firstUse?: string } }) {
  const query = new URLSearchParams();
  if (searchParams.firstUse === "opportunities") query.set("firstUse", "opportunities");
  if (searchParams.client) query.set("client", searchParams.client);
  const suffix = query.toString();
  redirect(suffix ? `/asistente-cm?${suffix}` : "/asistente-cm");
}
