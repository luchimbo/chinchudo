import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const schema = z.object({
  accessToken: z.string().min(100).max(8192),
  password: z.string().min(12).max(200),
});

export async function POST(request: NextRequest) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 12 caracteres." }, { status: 400 });
  }
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Supabase Auth no está configurado." }, { status: 503 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supabase.auth.getUser(parsed.data.accessToken);
  if (error || !data.user) {
    return NextResponse.json({ error: "El enlace venció o no es válido. Pedí uno nuevo." }, { status: 401 });
  }
  const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
    password: parsed.data.password,
  });
  if (updateError) {
    return NextResponse.json({ error: "No se pudo actualizar la contraseña." }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
