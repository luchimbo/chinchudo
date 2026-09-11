import { NextResponse } from "next/server";
import type { Client, PrismaClient } from "@prisma/client";
import {
  assertClientAccess,
  getCurrentUser,
  ClientResolutionError,
  type AuthUser,
} from "./auth";
import { prisma } from "./db";

/**
 * Guards reutilizables para Route Handlers y Server Actions, construidos
 * sobre los primitivos de src/lib/auth.ts (no los reemplazan). Cada uno
 * lanza ClientResolutionError con el status HTTP correcto; toErrorResponse
 * lo traduce para las rutas de API.
 */

export async function requireSession(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new ClientResolutionError("No autenticado.", 401);
  return user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireSession();
  if (user.role !== "admin") {
    throw new ClientResolutionError("Requiere rol admin.", 403);
  }
  return user;
}

/**
 * Valida que el clientId pertenezca a la sesión y devuelve el Client.
 * Rechaza explícitamente null/undefined: un recurso sin dueño (clientId
 * huérfano) no lo puede reclamar nadie por default.
 */
export async function requireOwnedClientId(
  clientId: string | null | undefined,
  db: PrismaClient = prisma,
): Promise<Client> {
  await requireSession();
  if (!clientId) {
    throw new ClientResolutionError("Recurso sin cliente asignado.", 404);
  }
  await assertClientAccess(db, clientId);
  return db.client.findUniqueOrThrow({ where: { id: clientId } });
}

export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ClientResolutionError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : "Error interno";
  return NextResponse.json({ error: message }, { status: 500 });
}
