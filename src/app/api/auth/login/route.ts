import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { verifyPassword, signJwt } from "@/lib/auth-crypto";
import { authUserCookieName, encodeAuthUser } from "@/lib/auth";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const form     = await req.formData();
    const username = ((form.get("username") as string) || "").toLowerCase().trim();
    const password = (form.get("password") as string) || "";
    const from     = (form.get("from") as string) || "/";

    const correct = process.env.AUTH_PASSWORD;
    const secret  = process.env.AUTH_SECRET;

    if (!secret) {
      return NextResponse.redirect(new URL("/login?error=config", req.url));
    }

    // 1. Intentar autenticar contra la base de datos
    const dbUser = await prisma.user.findUnique({
      where: { email: username },
      include: { client: true }
    });

    let authenticatedUser = null;

    if (dbUser) {
      const isPasswordOk = verifyPassword(password, dbUser.passwordHash);
      if (isPasswordOk) {
        authenticatedUser = dbUser;
      }
    }

    // 2. Fallback de legado (si no hay usuarios creados o si coincide con la clave maestra global)
    let isLegacyOk = false;
    if (!authenticatedUser && correct && password === correct) {
      // Si el email coincide con el default_user o el total de usuarios en DB es 0
      const totalUsers = await prisma.user.count();
      if (totalUsers === 0 || username === "default" || username === "") {
        isLegacyOk = true;
      }
    }

    if (!authenticatedUser && !isLegacyOk) {
      const url = new URL("/login", req.url);
      url.searchParams.set("error", "wrong");
      url.searchParams.set("from", from);
      return NextResponse.redirect(url);
    }

    const response = NextResponse.redirect(new URL(from, req.url));

    if (authenticatedUser) {
      // Registrar sesión usando JWT firmado
      const tokenPayload = {
        userId: authenticatedUser.id,
        email: authenticatedUser.email,
        role: authenticatedUser.role,
        clientId: authenticatedUser.clientId,
        clientSlug: authenticatedUser.client.slug,
      };
      const token = signJwt(tokenPayload, secret);

      const authUserPayload = {
        username: authenticatedUser.email,
        label: authenticatedUser.name,
        role: authenticatedUser.role as "admin" | "operator",
        clientSlugs: [authenticatedUser.client.slug],
      };

      response.cookies.set("auth_session", token, {
        httpOnly: true,
        sameSite: "lax",
        secure:   process.env.NODE_ENV === "production",
        maxAge:   60 * 60 * 24 * 7, // 7 días
        path:     "/",
      });

      response.cookies.set(authUserCookieName(), encodeAuthUser(authUserPayload), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    } else {
      // Login heredado con clave global maestra
      response.cookies.set("auth_session", secret, {
        httpOnly: true,
        sameSite: "lax",
        secure:   process.env.NODE_ENV === "production",
        maxAge:   60 * 60 * 24 * 7,
        path:     "/",
      });
      response.cookies.set(authUserCookieName(), "", { maxAge: 0, path: "/" });
    }

    return response;
  } catch (error) {
    console.error("Error en login API:", error);
    return NextResponse.redirect(new URL("/login?error=server", req.url));
  } finally {
    await prisma.$disconnect();
  }
}
