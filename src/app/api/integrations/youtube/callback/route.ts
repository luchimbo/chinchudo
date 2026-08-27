import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSocialToken } from "@/lib/social-token-crypto";
import { exchangeYouTubeCode, getAuthorizedYouTubeChannel } from "@/lib/youtube-publisher";
import { verifyYouTubeOAuthState } from "@/lib/youtube-oauth-state";

const STATE_COOKIE = "youtube_oauth_state";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const state = request.nextUrl.searchParams.get("state") || "";
  const verification = verifyYouTubeOAuthState(state, request.cookies.get(STATE_COOKIE)?.value);
  const returnTo = (status: string, clientSlug = "") => {
    const url = new URL("/oportunidades", origin);
    url.searchParams.set(status, "1");
    if (clientSlug) url.searchParams.set("client", clientSlug);
    const response = NextResponse.redirect(url);
    response.cookies.delete(STATE_COOKIE);
    return response;
  };
  if (!verification) return returnTo("youtubeError");

  try {
    await assertClientAccess(prisma, verification.clientId);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: verification.clientId }, select: { slug: true } });
    const providerError = request.nextUrl.searchParams.get("error");
    const code = request.nextUrl.searchParams.get("code");
    if (providerError || !code) return returnTo("youtubeError", client.slug);

    const tokens = await exchangeYouTubeCode(code);
    if (!tokens.refresh_token) throw new Error("youtube_refresh_token_missing");
    const channel = await getAuthorizedYouTubeChannel(tokens.access_token!);
    await prisma.youTubeConnection.upsert({
      where: { clientId_account: { clientId: verification.clientId, account: verification.account } },
      create: {
        clientId: verification.clientId,
        account: verification.account,
        accessToken: encryptSocialToken(tokens.access_token!),
        refreshToken: encryptSocialToken(tokens.refresh_token),
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        channelId: channel.id,
        channelTitle: channel.title,
        scopes: "youtube.force-ssl",
      },
      update: {
        accessToken: encryptSocialToken(tokens.access_token!),
        refreshToken: encryptSocialToken(tokens.refresh_token),
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        channelId: channel.id,
        channelTitle: channel.title,
        scopes: "youtube.force-ssl",
      },
    });
    return returnTo("youtubeConnected", client.slug);
  } catch {
    return returnTo("youtubeError");
  }
}
