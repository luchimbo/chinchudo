export const BLOG_LANGUAGES = [{ value: "es", label: "Español" }, { value: "en", label: "Inglés" }, { value: "de", label: "Alemán" }] as const;
export type BlogLanguage = typeof BLOG_LANGUAGES[number]["value"];
export function blogLanguage(value: unknown, fallback: BlogLanguage = "es"): BlogLanguage {
  return BLOG_LANGUAGES.some(item => item.value === value) ? value as BlogLanguage : fallback;
}
export function blogPreferences(policy: unknown): { calendar: boolean; language: BlogLanguage; comparisons: boolean } {
  const blog = (policy && typeof policy === "object" ? (policy as { blog?: Record<string, unknown> }).blog : undefined) || {};
  return { calendar: blog.calendar === true, language: blogLanguage(blog.language), comparisons: blog.comparisons === true };
}
export function editorialCalendarEnabled(client: { slug: string; responsePolicy?: unknown }) {
  return client.slug === "pcmidi" || blogPreferences(client.responsePolicy).calendar;
}
