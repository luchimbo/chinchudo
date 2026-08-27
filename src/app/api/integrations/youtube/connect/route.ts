import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { youtubeOAuthScope, youtubeRedirectUri } from "@/lib/youtube-publisher";
import { createYouTubeOAuthState } from "@/lib/youtube-oauth-state";

const STATE_COOKIE = "youtube_oauth_state";

export async function GET(request: NextRequest) {
  const clientSlug = request.nextUrl.searchParams.get("client");
  const account = request.nextUrl.searchParams.get("account");
  const origin = request.nextUrl.origin;
  if (!clientSlug || !account) {
    return NextResponse.redirect(new URL("/oportunidades?youtubeError=missing_connection_data", origin));
  }

  const client = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } });
  if (!client) return NextResponse.redirect(new URL("/oportunidades?youtubeError=client_not_found", origin));
  try {
    await assertClientAccess(prisma, client.id);
    if (!process.env.YOUTUBE_OAUTH_CLIENT_ID || !process.env.YOUTUBE_OAUTH_CLIENT_SECRET) {
      throw new Error("youtube_oauth_not_configured");
    }

    const nonce = randomBytes(16).toString("base64url");
    const state = createYouTubeOAuthState(client.id, account, nonce);
    const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizeUrl.search = new URLSearchParams({
      client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID,
      redirect_uri: youtubeRedirectUri(),
      response_type: "code",
      scope: youtubeOAuthScope(),
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/api/integrations/youtube",
    });
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "youtube_connection_failed";
    return NextResponse.redirect(new URL(`/oportunidades?youtubeError=${encodeURIComponent(reason)}`, origin));
  }
}
