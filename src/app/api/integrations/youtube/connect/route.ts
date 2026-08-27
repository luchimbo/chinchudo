import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { youtubeOAuthScope, youtubeRedirectUri } from "@/lib/youtube-publisher";

const STATE_COOKIE = "youtube_oauth_state";

function signState(payload: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Falta AUTH_SECRET.");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

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

    const issuedAt = Date.now().toString();
    const nonce = randomBytes(16).toString("base64url");
    const payload = [client.id, account, issuedAt, nonce].join(".");
    const state = `${Buffer.from(payload).toString("base64url")}.${signState(payload)}`;
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

export function verifyYouTubeOAuthState(state: string, expectedState: string | undefined): { clientId: string; account: string } | null {
  if (!expectedState || state.length !== expectedState.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))) return null;
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return null;
  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  const expectedSignature = signState(payload);
  if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;
  const [clientId, account, issuedAt] = payload.split(".");
  if (!clientId || !account || !issuedAt || Date.now() - Number(issuedAt) > 10 * 60 * 1000) return null;
  return { clientId, account };
}
