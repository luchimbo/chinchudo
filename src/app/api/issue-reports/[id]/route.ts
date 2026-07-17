import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDefaultIssueReporter } from "@/lib/auth";
import { updateIssueReportSchema } from "@/lib/issue-reports";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isDefaultIssueReporter())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const parsed = updateIssueReportSchema.safeParse({ id: params.id, ...(await request.json()) });
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const { id, status } = parsed.data;
  try {
    const report = await prisma.issueReport.update({
      where: { id },
      data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
    });
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json({ error: "Reporte no encontrado." }, { status: 404 });
  }
}
