import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ error: "No se subió ningún archivo" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Definir y crear el directorio de uploads en la carpeta public
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    // Generar un nombre único para el archivo para evitar colisiones
    const ext = path.extname(file.name) || ".jpg";
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
