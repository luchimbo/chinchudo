// Destinations are stored by the admin in the one-use session, never accepted
// from the exchange request. Keep in sync with admin SUPPORT_PATHS.
const PATHS = new Set(["/", "/asistente-cm", "/blog", "/blog/calendario", "/blog/configuracion", "/videos", "/tendencias", "/leads", "/analytics", "/geo", "/monitoring", "/configuracion", "/onboarding"]);

export function supportDestination(metadata: unknown, slug: string): string {
  const candidate = metadata && typeof metadata === "object" && "targetPath" in metadata ? metadata.targetPath : null;
  const path = typeof candidate === "string" && PATHS.has(candidate) ? candidate : "/";
  const query = new URLSearchParams({ client: slug });
  if (path === "/onboarding") query.set("from", "configuracion");
  return `${path}?${query}`;
}
