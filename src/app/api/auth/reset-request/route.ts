import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateAccountToken, hashAccountToken, PASSWORD_RESET_TTL_MS } from "@/lib/account-tokens";
import { sendAccountEmail } from "@/lib/mailer";

const GENERIC_MESSAGE = "Si el email está registrado, vas a recibir un correo con instrucciones.";

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") || "").toLowerCase().trim();

  const rl = await checkRateLimit(`reset_request:ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    // Misma respuesta genérica: no revelar el rate limit tampoco distingue nada.
    return NextResponse.redirect(new URL("/recuperar?sent=1", req.url), { status: 303 });
  }

  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Nunca se revela si el email existe: misma respuesta en ambos casos.
    if (user) {
      const token = generateAccountToken();
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashAccountToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });
      const resetUrl = `${process.env.CLIENT_APP_URL || new URL(req.url).origin}/recuperar/${token}`;
      await sendAccountEmail({
        to: user.email,
        subject: "Recuperar contraseña",
        text: `Restablecé tu contraseña acá (vence en 1 hora): ${resetUrl}`,
        html: `<p>Restablecé tu contraseña (el link vence en 1 hora):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
      });
    }
  }

  return NextResponse.redirect(new URL("/recuperar?sent=1", req.url), { status: 303 });
}
