// Autor de una oportunidad: se deduce de la URL cuando la fuente no lo trae
// y se formatea para que la UI muestre nombre y @handle por separado.

export type SourceAuthor = { name: string; handle: string; profileUrl: string };

type Network = "youtube" | "reddit" | "instagram" | "tiktok" | "facebook" | "linkedin" | "x" | "";

const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "stories", "accounts", "direct", "web"]);
const FACEBOOK_RESERVED = new Set(["groups", "watch", "reel", "photo", "photo.php", "story.php", "permalink.php", "profile.php", "share", "events", "marketplace", "hashtag", "search", "login"]);
const X_RESERVED = new Set(["i", "search", "hashtag", "home", "explore", "intent", "share"]);

function networkOf(channel: string, url: URL | null): Network {
  const value = `${channel} ${url?.hostname ?? ""}`.toLowerCase();
  if (value.includes("youtube") || value.includes("youtu.be")) return "youtube";
  if (value.includes("reddit")) return "reddit";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("linkedin")) return "linkedin";
  if (/(^|\s)x(\s|$)|twitter|(^|\.)x\.com/.test(value)) return "x";
  return "";
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

function segments(url: URL) {
  return url.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
}

function humanizeSlug(slug: string) {
  return slug
    .replace(/-[0-9a-f]{6,}$/i, "")
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Deduce el autor solo a partir de la URL, sin llamadas de red. */
export function authorFromUrl(channel: string, sourceUrl: string): SourceAuthor | null {
  const url = parseUrl(sourceUrl);
  if (!url) return null;
  const parts = segments(url);
  const first = parts[0] ?? "";

  switch (networkOf(channel, url)) {
    case "tiktok": {
      const handle = parts.find((part) => part.startsWith("@") && part.length > 1);
      return handle ? { name: handle, handle, profileUrl: `https://www.tiktok.com/${handle}` } : null;
    }
    case "youtube": {
      if (first.startsWith("@") && first.length > 1) return { name: first, handle: first, profileUrl: `https://www.youtube.com/${first}` };
      if ((first === "c" || first === "user") && parts[1]) return { name: parts[1], handle: "", profileUrl: `https://www.youtube.com/${first}/${parts[1]}` };
      return null;
    }
    case "instagram": {
      if (!first || INSTAGRAM_RESERVED.has(first.toLowerCase())) return null;
      const handle = `@${first}`;
      return { name: handle, handle, profileUrl: `https://www.instagram.com/${first}/` };
    }
    case "x": {
      if (!first || X_RESERVED.has(first.toLowerCase()) || parts[1] !== "status") return null;
      const handle = `@${first}`;
      return { name: handle, handle, profileUrl: `https://x.com/${first}` };
    }
    case "linkedin": {
      if (first === "in" && parts[1]) return { name: humanizeSlug(parts[1]), handle: "", profileUrl: `https://www.linkedin.com/in/${parts[1]}` };
      if (first === "company" && parts[1]) return { name: humanizeSlug(parts[1]), handle: "", profileUrl: `https://www.linkedin.com/company/${parts[1]}` };
      if (first === "posts" && parts[1]?.includes("_")) {
        const slug = parts[1].split("_")[0];
        return slug ? { name: humanizeSlug(slug), handle: "", profileUrl: `https://www.linkedin.com/in/${slug}` } : null;
      }
      return null;
    }
    case "facebook": {
      if (!first || FACEBOOK_RESERVED.has(first.toLowerCase()) || /^\d+$/.test(first)) return null;
      return { name: first, handle: "", profileUrl: `https://www.facebook.com/${first}` };
    }
    default:
      return null;
  }
}

async function fetchJson(url: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { "User-Agent": "pcmidi-suite/1.0 (source-author resolver)", Accept: "application/json" },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Language": "es-AR,es;q=0.9" },
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStatus(url: string, timeoutMs: number, fetchImpl: typeof fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal, headers: { "User-Agent": "pcmidi-suite/1.0 (source-author resolver)" } });
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

function unescapeJsonString(value: string | undefined) {
  if (!value) return "";
  try {
    return String(JSON.parse(`"${value}"`)).trim();
  } catch {
    return value.trim();
  }
}

function youtubeAuthor(name: string, profileUrl: string): SourceAuthor {
  const handle = profileUrl.match(/youtube\.com\/(@[^/?#]+)/)?.[1] ?? "";
  return { name, handle: handle ? decodeURIComponent(handle) : "", profileUrl };
}

/**
 * Resuelve el autor con la mejor información pública disponible:
 * oEmbed de YouTube, JSON público de Reddit y, si no, la URL.
 * Nunca lanza: devuelve null si no se pudo identificar.
 */
export async function resolveSourceAuthor(
  channel: string,
  sourceUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SourceAuthor | null> {
  const fromUrl = authorFromUrl(channel, sourceUrl);
  if (fromUrl) return fromUrl;
  const url = parseUrl(sourceUrl);
  if (!url) return null;
  const timeoutMs = options.timeoutMs ?? 5000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const network = networkOf(channel, url);

  if (network === "youtube") {
    const data = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(sourceUrl)}`, timeoutMs, fetchImpl);
    const oembedName = typeof data?.author_name === "string" ? data.author_name.trim() : "";
    if (oembedName) return youtubeAuthor(oembedName, typeof data?.author_url === "string" ? data.author_url : "");
    // oEmbed responde 401 cuando el video no permite insertarse; la página
    // del video igual publica el canal. Los videos privados no lo exponen.
    const html = await fetchText(sourceUrl, timeoutMs, fetchImpl);
    const pageName = unescapeJsonString(html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1]);
    if (!pageName) return null;
    return youtubeAuthor(pageName, unescapeJsonString(html.match(/"ownerProfileUrl":"((?:[^"\\]|\\.)*)"/)?.[1]).replace(/^http:/, "https:"));
  }

  if (network === "reddit" && url.pathname.includes("/comments/")) {
    const jsonUrl = `https://www.reddit.com${url.pathname.replace(/\/+$/, "")}.json?limit=1`;
    const data = await fetchJson(jsonUrl, timeoutMs, fetchImpl);
    const author = data?.[0]?.data?.children?.[0]?.data?.author;
    if (typeof author !== "string" || !author || author === "[deleted]") return null;
    return { name: `u/${author}`, handle: `u/${author}`, profileUrl: `https://www.reddit.com/user/${author}` };
  }

  return null;
}

/** Comunidad donde se publicó (hoy solo subreddits), útil cuando no hay autor. */
export function communityFromUrl(sourceUrl: string): string {
  const url = parseUrl(sourceUrl);
  if (!url || networkOf("", url) !== "reddit") return "";
  const parts = segments(url);
  return parts[0] === "r" && parts[1] ? `r/${parts[1]}` : "";
}

/** Valor a guardar en Opportunity.sourceAuthor. */
export function storedAuthor(author: SourceAuthor | null) {
  return author?.name ?? "";
}

export type DisplayAuthor = { name: string; handle: string; profileUrl: string; initial: string } | null;

/** Separa nombre visible, @handle y enlace al perfil para mostrar en la UI. */
export function formatAuthor(sourceAuthor: string, channel: string, sourceUrl: string): DisplayAuthor {
  const raw = (sourceAuthor || "").trim();
  const fromUrl = authorFromUrl(channel, sourceUrl);
  if (!raw && !fromUrl) return null;

  const network = networkOf(channel, parseUrl(sourceUrl));
  let name = raw || fromUrl!.name;
  let handle = fromUrl?.handle ?? "";
  let profileUrl = fromUrl?.profileUrl ?? "";

  const prefixed = name.match(/^(@|u\/)(.+)$/);
  if (prefixed) {
    handle = name;
    name = prefixed[2];
    const bare = prefixed[2];
    if (prefixed[1] === "u/") profileUrl = `https://www.reddit.com/user/${bare}`;
    else if (network === "tiktok") profileUrl = `https://www.tiktok.com/@${bare}`;
    else if (network === "instagram") profileUrl = `https://www.instagram.com/${bare}/`;
    else if (network === "x") profileUrl = `https://x.com/${bare}`;
    else if (network === "youtube") profileUrl = `https://www.youtube.com/@${bare}`;
  }
  if (handle && handle.replace(/^(@|u\/)/, "").toLowerCase() === name.toLowerCase() && !prefixed) handle = "";

  const initial = (name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "?").toUpperCase();
  return { name, handle, profileUrl, initial };
}

export type YouTubeAvailability = "available" | "private" | "removed" | "unknown";

/** Id del video en URLs watch, shorts, youtu.be o live; vacío si no es un video. */
export function youtubeVideoId(sourceUrl: string): string {
  const url = parseUrl(sourceUrl);
  if (!url || networkOf("", url) !== "youtube") return "";
  if (url.hostname.includes("youtu.be")) return segments(url)[0] ?? "";
  const fromQuery = url.searchParams.get("v");
  if (fromQuery) return fromQuery;
  const parts = segments(url);
  return (parts[0] === "shorts" || parts[0] === "live") && parts[1] ? parts[1] : "";
}

/** Título público del video vía oEmbed; vacío si no es un video o no se pudo obtener. */
export async function fetchYouTubeTitle(
  sourceUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const videoId = youtubeVideoId(sourceUrl);
  if (!videoId) return "";
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const data = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, options.timeoutMs ?? 8000, options.fetchImpl ?? fetch);
  return typeof data?.title === "string" ? data.title.trim() : "";
}

/**
 * Un video privado o eliminado no se puede responder, así que no tiene
 * sentido mostrarlo como oportunidad. Se usa oEmbed (liviano y sin bloqueos
 * anti-bot): 200/401 disponible, 403 privado, 400/404 eliminado. Si la
 * respuesta es otra se consulta la página del video. Ante cualquier duda
 * (red caída, página inesperada) devuelve "unknown" y no se descarta nada.
 */
export async function checkYouTubeAvailability(
  sourceUrl: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<YouTubeAvailability> {
  const videoId = youtubeVideoId(sourceUrl);
  if (!videoId) return "unknown";
  const timeoutMs = options.timeoutMs ?? 8000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  const oembedStatus = await fetchStatus(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, timeoutMs, fetchImpl);
  if (oembedStatus === 200 || oembedStatus === 401) return "available";
  if (oembedStatus === 403) return "private";
  if (oembedStatus === 400 || oembedStatus === 404) return "removed";

  const html = await fetchText(watchUrl, timeoutMs, fetchImpl);
  const match = html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"((?:[^"\\]|\\.)*)")?/);
  if (!match) return "unknown";
  const [, status, rawReason] = match;
  const reason = unescapeJsonString(rawReason);
  if (/privad|private/i.test(reason)) return "private";
  if (status === "ERROR") return "removed";
  return "available";
}
