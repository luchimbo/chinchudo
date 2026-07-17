import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDefaultIssueReporter } from "@/lib/auth";
import { createIssueReportSchema, getIssueSector } from "@/lib/issue-reports";

export async function POST(request: NextRequest) {
  if (!(await isDefaultIssueReporter())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const parsed = createIssueReportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  }

  const { description, originPath, imageUrl = "" } = parsed.data;
  const report = await prisma.issueReport.create({
    data: { description, originPath, imageUrl, sector: getIssueSector(originPath) },
  });

  return NextResponse.json({ report }, { status: 201 });
}
