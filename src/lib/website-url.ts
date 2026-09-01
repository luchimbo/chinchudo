/**
 * Makes a domain pasted by a person usable as a web URL.
 * Server-side public-address checks must still run before making a request.
 */
export function normalizeWebsiteUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
}
