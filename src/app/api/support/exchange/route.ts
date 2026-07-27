import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJwt } from "@/lib/auth-crypto";
import { hashSupportExchangeCode } from "@/lib/support-auth";

const SUPPORT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 365;

function requestIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "";
}

export async function POST(request: NextRequest) {
  const pepper = process.env.SUPPORT_EXCHANGE_PEPPER;
  const sessionSecret = process.env.SUPPORT_SESSION_SECRET;
  if (!pepper || !sessionSecret) {
    return NextResponse.json({ error: "Soporte delegado no configurado." }, { status: 503 });
  }

  const contentType = request.headers.get("content-type") || "";
  const code = contentType.includes("application/json")
    ? String((await request.json()).code || "")
    : String((await request.formData()).get("code") || "");
  if (code.length < 32 || code.length > 256) {
    return NextResponse.json({ error: "Código inválido." }, { status: 400 });
  }

  const tokenHash = hashSupportExchangeCode(code, pepper);
  const now = new Date();
  const delegated = await prisma.$transaction(async (tx) => {
    const candidate = await tx.supportSession.findFirst({
      where: {
        tokenHash,
        exchangedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        platformAdmin: { active: true },
      },
      include: { client: { select: { slug: true } } },
    });
    if (!candidate) return null;
    const consumed = await tx.supportSession.updateMany({
      where: { id: candidate.id, exchangedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: {
        exchangedAt: now,
        expiresAt: new Date(now.getTime() + SUPPORT_SESSION_TTL_SECONDS * 1000),
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent") || "",
      },
    });
    if (consumed.count !== 1) return null;
    await tx.adminAuditEvent.create({
      data: {
        actorId: candidate.platformAdminId,
        clientId: candidate.clientId,
        supportSessionId: candidate.id,
        action: "support_session.exchanged",
        targetType: "SupportSession",
        targetId: candidate.id,
        ipAddress: requestIp(request),
        userAgent: request.headers.get("user-agent") || "",
      },
    });
    return candidate;
  });

  if (!delegated) {
    return NextResponse.json({ error: "Código vencido, usado o revocado." }, { status: 401 });
  }

  const token = signJwt({
    type: "support_session",
    sid: delegated.id,
    clientId: delegated.clientId,
  }, sessionSecret, SUPPORT_SESSION_TTL_SECONDS);
  const response = NextResponse.redirect(
    new URL(`/?client=${encodeURIComponent(delegated.client.slug)}`, request.url),
    303,
  );
  response.cookies.set("support_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SUPPORT_SESSION_TTL_SECONDS,
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
