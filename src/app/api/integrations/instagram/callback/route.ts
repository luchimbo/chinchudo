import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSocialToken } from "@/lib/social-token-crypto";
import { INSTAGRAM_SCOPES, exchangeInstagramCode, getInstagramProfile } from "@/lib/instagram-insights";
import { verifyYouTubeOAuthState } from "@/lib/youtube-oauth-state";

const STATE_COOKIE = "instagram_oauth_state";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const verification = verifyYouTubeOAuthState(request.nextUrl.searchParams.get("state") || "", request.cookies.get(STATE_COOKIE)?.value);
  const back = (status: string, clientSlug = "") => {
    const url = new URL("/estudio/resultados", origin);
    if (clientSlug) url.searchParams.set("client", clientSlug);
    url.searchParams.set("instagram", status);
    const response = NextResponse.redirect(url);
    response.cookies.delete(STATE_COOKIE);
    return response;
  };
  if (!verification || verification.account !== "instagram") return back("error");
  try {
    await assertClientAccess(prisma, verification.clientId);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: verification.clientId }, select: { slug: true } });
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.get("error") || !code) return back("denied", client.slug);
    const tokens = await exchangeInstagramCode(code);
    const profile = await getInstagramProfile(tokens.accessToken);
    const data = { igUserId: profile.id || tokens.userId, username: profile.username, accessToken: encryptSocialToken(tokens.accessToken), expiresAt: tokens.expiresAt, scopes: INSTAGRAM_SCOPES.join(","), lastError: "" };
    await prisma.instagramConnection.upsert({ where: { clientId: verification.clientId }, create: { clientId: verification.clientId, ...data }, update: data });
    return back("connected", client.slug);
  } catch {
    return back("error");
  }
}
