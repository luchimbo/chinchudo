import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyJwt } from "@/lib/auth-crypto";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("support_session")?.value;
  const secret = process.env.SUPPORT_SESSION_SECRET;
  if (token && secret) {
    const payload = verifyJwt(token, secret);
    if (payload?.type === "support_session" && payload?.sid) {
      const session = await prisma.supportSession.findUnique({
        where: { id: payload.sid },
        select: { id: true, platformAdminId: true, clientId: true },
      });
      if (session) {
        await prisma.$transaction([
          prisma.supportSession.update({
            where: { id: session.id },
            data: { endedAt: new Date() },
          }),
          prisma.adminAuditEvent.create({
            data: {
              actorId: session.platformAdminId,
              clientId: session.clientId,
              supportSessionId: session.id,
              action: "support_session.ended",
              targetType: "SupportSession",
              targetId: session.id,
            },
          }),
        ]);
      }
    }
  }
  const response = NextResponse.redirect(
    process.env.PLATFORM_ADMIN_URL || "https://cafishia-admin.vercel.app/",
    303,
  );
  response.cookies.set("support_session", "", { maxAge: 0, path: "/" });
  return response;
}
