import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, requireOwnedClientId, toErrorResponse } from "@/lib/auth-guards";
import { generateAccountToken, hashAccountToken, INVITATION_TTL_MS } from "@/lib/account-tokens";
import { sendAccountEmail } from "@/lib/mailer";
import { checkRateLimit } from "@/lib/rate-limit";

const schema = z.object({
  clientId: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["admin", "operator"]).default("operator"),
});

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = schema.parse(await request.json());
    const client = await requireOwnedClientId(body.clientId);

    const rl = await checkRateLimit(`invite:${admin.username}`, 10, 60 * 60 * 1000);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Demasiadas invitaciones. Esperá un momento." }, { status: 429 });
    }

    const emailNormalized = body.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: emailNormalized } });
    if (existing) {
      return NextResponse.json({ error: "Ese email ya tiene una cuenta." }, { status: 409 });
    }

    const token = generateAccountToken();
    await prisma.userInvitation.create({
      data: {
        clientId: client.id,
        email: emailNormalized,
        role: body.role,
        tokenHash: hashAccountToken(token),
        invitedById: admin.username,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    const inviteUrl = `${process.env.CLIENT_APP_URL || new URL(request.url).origin}/invitacion/${token}`;
    await sendAccountEmail({
      to: emailNormalized,
      subject: `Invitación a ${client.name}`,
      text: `Te invitaron a sumarte a ${client.name}. Completá tu registro: ${inviteUrl}`,
      html: `<p>Te invitaron a sumarte a <strong>${client.name}</strong>.</p><p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
