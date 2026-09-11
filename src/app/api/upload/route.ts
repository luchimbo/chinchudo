import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Tipo de archivo no permitido. Usá PNG, JPG o WEBP." }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "El archivo supera los 2 MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Definir y crear el directorio de uploads en la carpeta public
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Nombre único; la extensión sale del MIME, no del nombre que envía quien sube.
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    // Guardar el buffer en el sistema de archivos
    await writeFile(filePath, buffer);

    // Retornar la URL relativa del archivo público
    const fileUrl = `/uploads/${fileName}`;

    return NextResponse.json({ success: true, url: fileUrl });
  } catch (err: any) {
    console.error("[Upload API Error]:", err);
    return NextResponse.json({ error: err.message || "Error interno al procesar la subida" }, { status: 500 });
  }
}
