import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { instagramAuthorizeUrl, instagramConfigured } from "@/lib/instagram-insights";
import { createYouTubeOAuthState } from "@/lib/youtube-oauth-state";

const STATE_COOKIE = "instagram_oauth_state";

/** Conectar Instagram: lleva al login de Instagram para autorizar la lectura de métricas. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const clientSlug = request.nextUrl.searchParams.get("client") ?? "";
  const back = (status: string) => NextResponse.redirect(new URL(`/estudio/resultados?client=${encodeURIComponent(clientSlug)}&instagram=${status}`, origin));
  const client = clientSlug ? await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } }) : null;
  if (!client) return back("error");
  try {
    await assertClientAccess(prisma, client.id);
    if (!instagramConfigured()) return back("not_configured");
    // Mismo formato de state firmado que la conexión de YouTube; "instagram" ocupa el lugar de la cuenta.
    const state = createYouTubeOAuthState(client.id, "instagram", randomBytes(16).toString("base64url"));
    const response = NextResponse.redirect(instagramAuthorizeUrl(state));
    response.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 10 * 60, path: "/api/integrations/instagram" });
    return response;
  } catch {
    return back("error");
  }
}
