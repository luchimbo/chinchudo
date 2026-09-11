const PUBLIC_EXACT = new Set([
  "/login",
  "/registro",
  "/recuperar",
  "/verificar-email",
  "/api/support/exchange",
  "/api/leads",
  "/api/events",
  "/api/click",
  "/api/unsubscribe",
  "/api/nurture",
]);

const PUBLIC_PREFIXES = ["/api/auth/", "/l/", "/recuperar/", "/invitacion/"];

/**
 * Determina si una ruta puede servirse sin sesión. Usado por el middleware
 * (Edge) y por el test de regresión del bug de prefijo `/l` que dejaba
 * públicas /leads, /landings y /logins.
 */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
