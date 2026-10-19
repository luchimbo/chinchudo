import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signJwt } from "@/lib/auth-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { defaultDraft } from "@/lib/onboarding";
import { validatePassword } from "@/lib/password-policy";
import { generateAccountToken, hashAccountToken, EMAIL_VERIFICATION_TTL_MS } from "@/lib/account-tokens";
import { sendAccountEmail } from "@/lib/mailer";
import { z } from "zod";
import { randomUUID } from "node:crypto";

export const maxDuration = 30;
const registrationSchema = z.object({
  name: z.string().trim().min(1, "Ingresá tu nombre.").max(100, "Usá hasta 100 caracteres."),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido.").max(254),
  clientName: z.string().trim().min(1, "Ingresá el nombre del negocio.").max(160, "Usá hasta 160 caracteres."),
  password: z.string().min(1, "Elegí una contraseña."),
});

const AUTH_SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h (sesión de panel)

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimitResponse(resetInMs: number): NextResponse {
  return NextResponse.json(
    { error: "Demasiados intentos, espera un momento e intentá de nuevo." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(resetInMs / 1000)) } },
  );
}

const defaultChannels = [
  { name: "YouTube", type: "video_comments", baseUrl: "https://www.youtube.com" },
  { name: "Facebook", type: "groups_posts", baseUrl: "https://www.facebook.com" },
  { name: "Instagram", type: "reels_comments", baseUrl: "https://www.instagram.com" },
  { name: "X", type: "threads", baseUrl: "https://x.com" },
  { name: "Reddit", type: "public_threads", baseUrl: "https://www.reddit.com" },
];

export async function POST(req: NextRequest) {
  try {
    const parsed = registrationSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Revisá los campos indicados.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 });
    const { email, password, name, clientName } = parsed.data;

    // Rate limit por IP (5 intentos cada 15 min).
    const rlIp = await checkRateLimit(`register:ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
    if (!rlIp.allowed) return rateLimitResponse(rlIp.resetInMs);

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "No se pudo crear la cuenta. Intentá de nuevo más tarde." },
        { status: 500 }
      );
    }

    // Normalizar email
    const emailNormalized = email.toLowerCase().trim();

    const passwordCheck = validatePassword(password, emailNormalized);
    if (!passwordCheck.valid) {
      return NextResponse.json({ error: passwordCheck.error, fieldErrors: { password: [passwordCheck.error] } }, { status: 400 });
    }

    // Validar usuario duplicado
    const existingUser = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Este email ya tiene una cuenta. Podés ingresar o recuperar tu contraseña.", fieldErrors: { email: ["Este email ya tiene una cuenta."] } },
        { status: 409 }
      );
    }

    // Slugificar nombre de empresa
    const clientSlug = clientName
      .toLowerCase()
      .trim()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `negocio-${randomUUID().slice(0, 8)}`;

    // Validar slug de cliente duplicado
    const existingClient = await prisma.client.findFirst({
      where: {
        OR: [
          { name: clientName.trim() },
          { slug: clientSlug }
        ]
      }
    });
    if (existingClient) {
      return NextResponse.json(
        { error: "Ya existe un negocio con ese nombre. Si es tuyo, ingresá a tu cuenta; si no, usá un nombre más específico.", fieldErrors: { clientName: ["Usá un nombre más específico para tu negocio."] } },
        { status: 409 }
      );
    }

    // Hashear clave
    const passwordHash = hashPassword(password);
    const verificationToken = generateAccountToken();

    // Crear cliente, usuario y canales en una transacción
    const { client, user } = await prisma.$transaction(async (tx) => {
      // 1. Crear el cliente
      const newClient = await tx.client.create({
        data: {
          name: clientName.trim(),
          slug: clientSlug,
          description: "",
        },
      });

      // 2. Crear el usuario administrador
      const newUser = await tx.user.create({
        data: {
          email: emailNormalized,
          passwordHash,
          name: name.trim(),
          role: "admin",
          clientId: newClient.id,
        },
      });

      // 3. Crear / asegurar canales por defecto
      for (const chan of defaultChannels) {
        await tx.channel.upsert({
          where: { name: chan.name },
          update: {},
          create: {
            ...chan,
            responseStyleNotes: "Fuente monitoreada por agentes internos; requiere revision manual.",
          },
        });
      }

      // 4. Crear la fila de onboarding: marca este cliente como self-serve
      // (los clientes configurados a mano no tienen fila) y evita el upsert
      // perezoso disperso en la API de onboarding.
      await (tx as any).clientOnboarding.create({
        data: { clientId: newClient.id, draft: defaultDraft(newClient.name) },
      });
      await tx.emailVerificationToken.create({ data: { userId: newUser.id, tokenHash: hashAccountToken(verificationToken), expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) } });

      return { client: newClient, user: newUser };
    }, { timeout: 15000, maxWait: 3000 });

    // Verificación de email en modo "soft": se emite y se envía, pero no
    // bloquea el acceso todavía (evita romper a usuarios ya registrados
    // cuando esto se active). No interrumpe el registro si el envío falla.
    try {
      const verifyUrl = `${process.env.CLIENT_APP_URL || req.nextUrl.origin}/verificar-email?token=${verificationToken}`;
      await sendAccountEmail({
        to: user.email,
        subject: "Verificá tu email",
        text: `Confirmá tu cuenta: ${verifyUrl}`,
        html: `<p>Confirmá tu cuenta en Cafishia:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
      }, { timeoutMs: 3000 });
    } catch (err) {
      console.error("[register] No se pudo emitir/enviar la verificación de email", err);
    }

    // Generar JWT
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId,
      clientSlug: client.slug,
      tv: 0,
    };
    const token = signJwt(tokenPayload, secret, AUTH_SESSION_TTL_SECONDS);

    const response = NextResponse.json({ success: true, next: `/onboarding?client=${encodeURIComponent(client.slug)}` });

    // Establecer cookie de sesión
    response.cookies.set("auth_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: AUTH_SESSION_TTL_SECONDS,
      path: "/",
    });

    return response;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "La cuenta o el negocio ya se crearon. Intentá ingresar o revisá el nombre del negocio." }, { status: 409 });
    console.error("Error en registro:", error);
    return NextResponse.json(
      { error: "No se pudo crear la cuenta. Intentá de nuevo; si ya la creaste, podés ingresar." },
      { status: 500 }
    );
  }
}
