import { NextRequest, NextResponse } from "next/server";
import { analyzePublicWebsite } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  try {
    const body = await request.json();
    const analysis = await analyzePublicWebsite(
      String(body.url || ""),
      "Tu negocio",
    );
    return NextResponse.json({
      draft: analysis.draft,
      analysis: {
        pages: analysis.pages.map((page) => ({
          url: page.url,
          title: page.title,
          pageType: page.pageType,
        })),
        stats: analysis.draft.stats,
      },
      warning: analysis.warning,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo analizar el sitio.",
      },
      { status: 400 },
    );
  }
}
