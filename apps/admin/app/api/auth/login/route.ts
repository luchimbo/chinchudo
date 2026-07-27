import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ADMIN_COOKIE, verifyPlatformToken } from "@/lib/admin-auth";

const schema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Credenciales inválidas." }, { status: 400 });
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Supabase Auth no está configurado." }, { status: 503 });

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.session) return NextResponse.json({ error: "Credenciales inválidas." }, { status: 401 });
  const identity = await verifyPlatformToken(data.session.access_token);
  if (!identity) return NextResponse.json({ error: "Cuenta sin permiso de plataforma." }, { status: 403 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60,
    path: "/",
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
