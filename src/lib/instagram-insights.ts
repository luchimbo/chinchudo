import type { PrismaClient } from "@prisma/client";
import { decryptSocialToken, encryptSocialToken } from "./social-token-crypto";

// Instagram API con login de Instagram (Business Login): solo lectura de las
// publicaciones propias y sus métricas. No publica nada.
// Métricas válidas para REELS y FEED: views, reach, saved, shares, likes, comments
// (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights).

export const INSTAGRAM_SCOPES = ["instagram_business_basic", "instagram_business_manage_insights"];
const GRAPH = "https://graph.instagram.com/v21.0";
const MEDIA_METRICS = ["views", "reach", "saved", "shares", "likes", "comments"];
const REFRESH_BEFORE_MS = 7 * 24 * 60 * 60 * 1000;

export function instagramConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function instagramRedirectUri(): string {
  return process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/instagram/callback`;
}

export function instagramAuthorizeUrl(state: string): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: instagramRedirectUri(), response_type: "code", scope: INSTAGRAM_SCOPES.join(","), state }).toString();
  return url.toString();
}

async function json<T>(response: Response, label: string): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${label}: ${body?.error_message || body?.error?.message || response.status}`);
  return body as T;
}

/** Código → token corto → token largo (60 días). */
export async function exchangeInstagramCode(code: string): Promise<{ accessToken: string; expiresAt: Date | null; userId: string }> {
  const short = await json<{ access_token: string; user_id: number | string }>(await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", grant_type: "authorization_code", redirect_uri: instagramRedirectUri(), code }),
  }), "instagram_token");
  const long = await json<{ access_token: string; expires_in?: number }>(await fetch(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: process.env.META_APP_SECRET ?? "", access_token: short.access_token })}`), "instagram_long_token");
  return { accessToken: long.access_token, expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null, userId: String(short.user_id) };
}

export async function getInstagramProfile(accessToken: string): Promise<{ id: string; username: string }> {
  const profile = await json<{ user_id?: string; id?: string; username?: string }>(await fetch(`${GRAPH}/me?${new URLSearchParams({ fields: "user_id,username", access_token: accessToken })}`), "instagram_profile");
  return { id: String(profile.user_id ?? profile.id ?? ""), username: profile.username ?? "" };
}

async function freshToken(prisma: Pick<PrismaClient, "instagramConnection">, connection: { id: string; accessToken: string; expiresAt: Date | null }): Promise<string> {
  const token = decryptSocialToken(connection.accessToken);
  if (!connection.expiresAt || connection.expiresAt.getTime() - Date.now() > REFRESH_BEFORE_MS) return token;
  const refreshed = await json<{ access_token: string; expires_in?: number }>(await fetch(`https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token })}`), "instagram_refresh");
  await prisma.instagramConnection.update({ where: { id: connection.id }, data: { accessToken: encryptSocialToken(refreshed.access_token), expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null } });
  return refreshed.access_token;
}

/** Normaliza un link de Instagram para cruzarlo con el permalink de la API. */
export function instagramShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]+)/i);
  return match ? match[1] : null;
}

type Media = { id: string; permalink: string; media_type: string; media_product_type?: string };

/**
 * Trae las métricas de las piezas publicadas del cliente que tengan link de
 * Instagram y guarda una captura por pieza. Devuelve cuántas actualizó.
 */
export async function syncInstagramMetrics(prisma: PrismaClient, clientId: string): Promise<{ updated: number; unmatched: number }> {
  const connection = await prisma.instagramConnection.findUnique({ where: { clientId } });
  if (!connection) throw new Error("Instagram no está conectado.");
  try {
    const token = await freshToken(prisma, connection);
    const pieces = await prisma.contentIdea.findMany({ where: { clientId, status: "PUBLISHED", publishedUrl: { contains: "instagram.com" } }, select: { id: true, publishedUrl: true } });
    const wanted = new Map(pieces.map((piece) => [instagramShortcode(piece.publishedUrl), piece.id]).filter((entry): entry is [string, string] => Boolean(entry[0])));
    if (!wanted.size) {
      await prisma.instagramConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: "" } });
      return { updated: 0, unmatched: 0 };
    }

    const media: Media[] = [];
    let next: string | null = `${GRAPH}/me/media?${new URLSearchParams({ fields: "id,permalink,media_type,media_product_type", limit: "50", access_token: token })}`;
    for (let page = 0; next && page < 4; page++) {
      const body: { data?: Media[]; paging?: { next?: string } } = await json(await fetch(next), "instagram_media");
      media.push(...(body.data ?? []));
      next = body.paging?.next ?? null;
    }

    let updated = 0;
    for (const item of media) {
      const pieceId = wanted.get(instagramShortcode(item.permalink) ?? "");
      if (!pieceId || item.media_product_type === "STORY") continue;
      const insights: { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] } = await json(await fetch(`${GRAPH}/${item.id}/insights?${new URLSearchParams({ metric: MEDIA_METRICS.join(","), access_token: token })}`), "instagram_insights");
      const value = (name: string) => {
        const entry = insights.data?.find((metric) => metric.name === name);
        const raw = entry?.total_value?.value ?? entry?.values?.[0]?.value;
        return typeof raw === "number" ? raw : null;
      };
      await prisma.pieceMetricSnapshot.create({ data: { contentIdeaId: pieceId, source: "INSTAGRAM_API", views: value("views"), reach: value("reach"), saves: value("saved"), shares: value("shares"), likes: value("likes"), comments: value("comments") } });
      wanted.delete(instagramShortcode(item.permalink) ?? "");
      updated++;
    }
    await prisma.instagramConnection.update({ where: { id: connection.id }, data: { lastSyncAt: new Date(), lastError: "" } });
    return { updated, unmatched: wanted.size };
  } catch (err) {
    await prisma.instagramConnection.update({ where: { id: connection.id }, data: { lastError: err instanceof Error ? err.message.slice(0, 240) : "Error desconocido" } });
    throw err;
  }
}
