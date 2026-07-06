import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const clientSlug = url.searchParams.get("client")?.trim();
  const landingId = url.searchParams.get("landing")?.trim() || "";

  if (!clientSlug) {
    return new NextResponse("Falta client.", { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { slug: clientSlug },
    select: {
      id: true,
      name: true,
      slug: true,
      storeUrl: true,
      blogBaseUrl: true,
      labName: true,
      logoUrl: true,
      landingTemplate: true,
      landingPrimaryColor: true,
      landingSecondaryColor: true,
    },
  });

  if (!client) {
    return new NextResponse("Cliente no encontrado.", { status: 404 });
  }

  try {
    await assertClientAccess(prisma, client.id);
  } catch {
    return new NextResponse("Sin acceso al cliente.", { status: 403 });
  }

  const scriptPath = path.join(process.cwd(), "landing-build", "build_landings.py");
  const args = [
    scriptPath,
    "--client-slug",
    clientSlug,
    "preview",
    "--base-url",
    client.blogBaseUrl || process.env.LANDING_BASE_URL || "",
  ];
  if (landingId) args.push("--landing-id", landingId);

  try {
    const { stdout } = await execFileAsync(process.env.PYTHON || "python", args, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 8,
      timeout: 30000,
      env: {
        ...process.env,
        LANDING_CLIENT_CONFIG_JSON: JSON.stringify(client),
      },
    });

    const htmlStart = stdout.indexOf("<!DOCTYPE html>");
    const html = htmlStart >= 0 ? stdout.slice(htmlStart) : stdout;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la preview.\n${message}`, { status: 500 });
  }
}
