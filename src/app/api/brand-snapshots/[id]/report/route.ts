import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const snapshot = await prisma.brandSnapshot.findUnique({ where: { id: params.id } });
  if (!snapshot?.pdfPath) return NextResponse.json({ error: "Informe no encontrado" }, { status: 404 });
  try {
    await assertClientAccess(prisma, snapshot.clientId);
  } catch {
    return NextResponse.json({ error: "No tenés acceso a este informe." }, { status: 403 });
  }
  try {
    const pdf = await readFile(snapshot.pdfPath);
    return new NextResponse(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename=brand-snapshot-${snapshot.milestone}.pdf` } });
  } catch { return NextResponse.json({ error: "Archivo de informe no disponible en este servidor" }, { status: 404 }); }
}
