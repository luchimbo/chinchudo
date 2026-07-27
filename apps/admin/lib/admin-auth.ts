import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db";

export const ADMIN_COOKIE = "platform_admin_access_token";
export const ADMIN_REFRESH_COOKIE = "platform_admin_refresh_token";
export const PERSISTENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function readJwtPayload(token: string): Record<string, unknown> | null {
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
  catch { return null; }
}

export async function verifyPlatformToken(token: string) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const profile = await prisma.platformAdminProfile.findUnique({ where: { authUserId: data.user.id } });
  if (!profile?.active) return null;
  return { user: data.user, profile, claims: readJwtPayload(token) ?? {} };
}

export async function requirePlatformAdmin() {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return token ? verifyPlatformToken(token) : null;
}
