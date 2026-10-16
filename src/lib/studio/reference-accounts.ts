export type ReferencePlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
export type ReferenceKind = "COMPETENCIA" | "AFIN" | "FORMATO";

export const REFERENCE_KIND_LABEL: Record<ReferenceKind, { label: string; hint: string }> = {
  COMPETENCIA: { label: "Competencia", hint: "Venden lo mismo que vos" },
  AFIN: { label: "Afín", hint: "Mismo público, otro rubro" },
  FORMATO: { label: "Formato", hint: "Cuentas grandes, solo por cómo graban" },
};

export const PLATFORM_LABEL: Record<ReferencePlatform, string> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok", YOUTUBE: "YouTube" };

/** ig-viral recomienda entre 6 y 12 cuentas. */
export const REFERENCE_MIN = 6;
export const REFERENCE_MAX = 12;

const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "watch", "shorts", "results", "tag", "video", "feed"]);

/**
 * Convierte lo que pega el usuario (link o @usuario) en plataforma, usuario y
 * link canónico. Devuelve null si no se reconoce.
 */
export function parseReferenceAccount(input: string, fallbackPlatform: ReferencePlatform = "INSTAGRAM"): { platform: ReferencePlatform; handle: string; url: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^@?[\w.]{2,30}$/.test(raw)) {
    const handle = raw.replace(/^@/, "").toLowerCase();
    return { platform: fallbackPlatform, handle, url: canonicalUrl(fallbackPlatform, handle) };
  }
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "instagram.com") {
    const handle = parts[0]?.toLowerCase();
    if (!handle || RESERVED.has(handle)) return null;
    return { platform: "INSTAGRAM", handle, url: canonicalUrl("INSTAGRAM", handle) };
  }
  if (host === "tiktok.com") {
    const handle = parts[0]?.startsWith("@") ? parts[0].slice(1).toLowerCase() : null;
    if (!handle) return null;
    return { platform: "TIKTOK", handle, url: canonicalUrl("TIKTOK", handle) };
  }
  if (host === "youtube.com") {
    if (parts[0]?.startsWith("@")) {
      const handle = parts[0].slice(1);
      return { platform: "YOUTUBE", handle, url: canonicalUrl("YOUTUBE", handle) };
    }
    if ((parts[0] === "channel" || parts[0] === "c") && parts[1]) {
      return { platform: "YOUTUBE", handle: parts[1], url: `https://www.youtube.com/${parts[0]}/${parts[1]}` };
    }
  }
  return null;
}

export function canonicalUrl(platform: ReferencePlatform, handle: string): string {
  if (platform === "INSTAGRAM") return `https://www.instagram.com/${handle}/`;
  if (platform === "TIKTOK") return `https://www.tiktok.com/@${handle}`;
  return `https://www.youtube.com/@${handle}`;
}
