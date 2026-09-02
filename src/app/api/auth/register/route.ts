import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, signJwt } from "@/lib/auth-crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { defaultDraft } from "@/lib/onboarding";

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
    const data = await req.json();
    const { email, password, name, clientName } = data;

    if (!email || !password || !name || !clientName) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios en el formulario." },
        { status: 400 }
      );
    }

    // Rate limit por IP (5 intentos cada 15 min).
    const rlIp = checkRateLimit(`register:ip:${clientIp(req)}`, 5, 15 * 60 * 1000);
    if (!rlIp.allowed) return rateLimitResponse(rlIp.resetInMs);

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "El servidor no tiene configurado AUTH_SECRET." },
        { status: 500 }
      );
    }

    // Normalizar email
    const emailNormalized = email.toLowerCase().trim();

    // Validar usuario duplicado
    const existingUser = await prisma.user.findUnique({
      where: { email: emailNormalized },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "El email ya está registrado." },
        { status: 400 }
      );
    }

    // Slugificar nombre de empresa
    const clientSlug = clientName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

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
        { error: "La empresa o su abreviación ya se encuentra registrada." },
        { status: 400 }
      );
    }

    // Hashear clave
    const passwordHash = hashPassword(password);

    // Crear cliente, usuario y canales en una transacción
    const { client, user } = await prisma.$transaction(async (tx) => {
      // 1. Crear el cliente
      const newClient = await tx.client.create({
        data: {
          name: clientName.trim(),
          slug: clientSlug,
          description: `Espacio creado para ${name.trim()}`,
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

      return { client: newClient, user: newUser };
    });

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

    const response = NextResponse.json({ success: true });

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
    console.error("Error en registro:", error);
    return NextResponse.json(
      { error: `Error interno de registro: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
