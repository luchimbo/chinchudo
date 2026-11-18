import type { CatalogRule } from "@prisma/client";

/** Pure text helpers shared by client resolution and catalog ranking. */
export function normalizeForMatch(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function parseClientList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

export function catalogRuleMatches(sourceText: string, rules: Pick<CatalogRule, "category" | "keywords">[]): string[] {
  const text = normalizeForMatch(sourceText);
  return rules
    .filter((rule) => parseClientList(rule.keywords).some((kw) => text.includes(normalizeForMatch(kw))))
    .map((rule) => rule.category);
}
