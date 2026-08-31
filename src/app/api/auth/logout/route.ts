import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/auth-crypto";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const supportToken = req.cookies.get("support_session")?.value;
  const supportSecret = process.env.SUPPORT_SESSION_SECRET;
  let isSupportSession = false;
  if (supportToken && supportSecret) {
    const payload = verifyJwt(supportToken, supportSecret);
    if (payload?.type === "support_session" && payload?.sid) {
      isSupportSession = true;
      const delegated = await prisma.supportSession.findUnique({ where: { id: payload.sid } });
      if (delegated && !delegated.endedAt) {
        await prisma.$transaction([
          prisma.supportSession.update({ where: { id: delegated.id }, data: { endedAt: new Date() } }),
          prisma.adminAuditEvent.create({
            data: {
              actorId: delegated.platformAdminId,
              clientId: delegated.clientId,
              supportSessionId: delegated.id,
              action: "support_session.ended",
              targetType: "SupportSession",
              targetId: delegated.id,
            },
          }),
        ]);
      }
    }
  }
  const redirectUrl = isSupportSession
    ? process.env.PLATFORM_ADMIN_URL || "https://cafishia-admin.vercel.app/"
    : new URL("/login", req.url);
  const response = NextResponse.redirect(redirectUrl, 303);
  response.cookies.set("auth_session", "", { maxAge: 0, path: "/" });
  response.cookies.set("support_session", "", { maxAge: 0, path: "/" });
  return response;
}
