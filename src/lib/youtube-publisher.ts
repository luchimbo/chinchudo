import type { PrismaClient } from "@prisma/client";
import { decryptSocialToken } from "@/lib/social-token-crypto";

const YOUTUBE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_ROOT = "https://www.googleapis.com/youtube/v3";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type OfficialPublishResult =
  | { success: true; url: string; remoteId: string; method: "youtube_api"; dryRun?: boolean }
  | { success: false; error: string; method: "failed" };

function youtubeConfig() {
  const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan YOUTUBE_OAUTH_CLIENT_ID o YOUTUBE_OAUTH_CLIENT_SECRET.");
  }
  return { clientId, clientSecret };
}

export function youtubeRedirectUri(): string {
  return process.env.YOUTUBE_OAUTH_REDIRECT_URI || `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}/api/integrations/youtube/callback`;
}

export function youtubeOAuthScope(): string {
  return YOUTUBE_SCOPE;
}

function videoIdFromUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname === "youtu.be") return url.pathname.slice(1) || null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const shorts = url.pathname.match(/^\/shorts\/([^/?]+)/);
    return shorts?.[1] ?? null;
  } catch {
    return null;
  }
}

function commentIdFromUrl(sourceUrl: string): string | null {
  try {
    return new URL(sourceUrl).searchParams.get("lc");
  } catch {
    return null;
  }
}

function cleanUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    url.searchParams.delete("lc");
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

async function requestToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "youtube_token_exchange_failed");
  }
  return payload;
}

async function currentAccessToken(prisma: PrismaClient, connection: {
  id: string; accessToken: string; refreshToken: string; expiresAt: Date | null;
}): Promise<string> {
  const accessToken = decryptSocialToken(connection.accessToken);
  if (!connection.expiresAt || connection.expiresAt.getTime() > Date.now() + 60_000) {
    return accessToken;
  }

  const { clientId, clientSecret } = youtubeConfig();
  const refreshed = await requestToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: decryptSocialToken(connection.refreshToken),
    grant_type: "refresh_token",
  }));
  const refreshedAccessToken = refreshed.access_token;
  if (!refreshedAccessToken) throw new Error("youtube_refresh_missing_access_token");
  const { encryptSocialToken } = await import("@/lib/social-token-crypto");
  await prisma.youTubeConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptSocialToken(refreshedAccessToken),
      expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
    },
  });
  return refreshedAccessToken;
}

async function youtubeRequest<T>(accessToken: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string; errors?: Array<{ reason?: string }> } };
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason;
    throw new Error(reason || payload.error?.message || `youtube_http_${response.status}`);
  }
  return payload;
}

export async function publishYouTubeComment({
  prisma,
  clientId,
  account,
  sourceUrl,
  text,
  dryRun = false,
}: {
  prisma: PrismaClient;
  clientId: string;
  account: string;
  sourceUrl: string;
  text: string;
  dryRun?: boolean;
}): Promise<OfficialPublishResult> {
  const videoId = videoIdFromUrl(sourceUrl);
  if (!videoId) return { success: false, error: "invalid_youtube_url", method: "failed" };
  if (dryRun) return { success: true, url: cleanUrl(sourceUrl), remoteId: "", method: "youtube_api", dryRun: true };

  try {
    const connection = await prisma.youTubeConnection.findUnique({
      where: { clientId_account: { clientId, account } },
      select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
    });
    if (!connection) return { success: false, error: "youtube_not_connected", method: "failed" };

    const accessToken = await currentAccessToken(prisma, connection);
    const parentId = commentIdFromUrl(sourceUrl);
    if (parentId) {
      const created = await youtubeRequest<{ id: string }>(accessToken, "/comments?part=snippet", {
        snippet: { parentId, textOriginal: text },
      });
      return { success: true, url: `${cleanUrl(sourceUrl)}${cleanUrl(sourceUrl).includes("?") ? "&" : "?"}lc=${encodeURIComponent(created.id)}`, remoteId: created.id, method: "youtube_api" };
    }

    const video = await youtubeRequest<{ items?: Array<{ snippet?: { channelId?: string } }> }>(accessToken, `/videos?part=snippet&id=${encodeURIComponent(videoId)}`);
    const channelId = video.items?.[0]?.snippet?.channelId;
    if (!channelId) return { success: false, error: "youtube_video_not_found", method: "failed" };
    const created = await youtubeRequest<{ id: string }>(accessToken, "/commentThreads?part=snippet", {
      snippet: {
        channelId,
        videoId,
        topLevelComment: { snippet: { textOriginal: text } },
      },
    });
    return { success: true, url: cleanUrl(sourceUrl), remoteId: created.id, method: "youtube_api" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "youtube_publish_failed", method: "failed" };
  }
}

export async function exchangeYouTubeCode(code: string) {
  const { clientId, clientSecret } = youtubeConfig();
  return requestToken(new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: youtubeRedirectUri(),
    grant_type: "authorization_code",
  }));
}

export async function getAuthorizedYouTubeChannel(accessToken: string): Promise<{ id: string; title: string }> {
  const result = await youtubeRequest<{ items?: Array<{ id: string; snippet?: { title?: string } }> }>(accessToken, "/channels?part=snippet&mine=true");
  const channel = result.items?.[0];
  if (!channel) throw new Error("youtube_channel_not_found");
  return { id: channel.id, title: channel.snippet?.title || "Canal de YouTube" };
}
