import { NextRequest, NextResponse } from "next/server";
import { assertClientAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSocialToken } from "@/lib/social-token-crypto";

export async function DELETE(request: NextRequest) {
  const clientSlug = request.nextUrl.searchParams.get("client");
  const account = request.nextUrl.searchParams.get("account");
  if (!clientSlug || !account) return NextResponse.json({ error: "missing_connection_data" }, { status: 400 });
  const client = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "client_not_found" }, { status: 404 });

  try {
    await assertClientAccess(prisma, client.id);
    const connection = await prisma.youTubeConnection.findUnique({ where: { clientId_account: { clientId: client.id, account } } });
    if (connection) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decryptSocialToken(connection.accessToken))}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
      await prisma.youTubeConnection.delete({ where: { id: connection.id } });
    }
    return NextResponse.json({ revoked: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "youtube_revoke_failed" }, { status: 400 });
  }
}
