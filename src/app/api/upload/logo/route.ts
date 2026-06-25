import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

const BUCKET = "assets";
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const clientSlug = form.get("clientSlug") as string | null;

  if (!file || !clientSlug) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  // Verificar acceso al cliente (en dev sin sesión pasa; en prod exige permiso)
  const client = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  try {
    await assertClientAccess(prisma, client.id);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido. Usá PNG, JPG, WEBP o SVG." }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo supera los 2 MB." }, { status: 400 });
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `logos/${clientSlug}.${ext}`;

  const supabase = createServiceClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
