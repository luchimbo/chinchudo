import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertClientAccess } from "@/lib/auth";
import { getRelayUrl } from "@/lib/settings";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

function pythonCommand() {
  const envPython = process.env.PYTHON || process.env.PYTHON_BIN;
  if (envPython) return { command: envPython, argsPrefix: [] };

  const localPython =
    process.platform === "win32"
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python");

  if (existsSync(localPython)) return { command: localPython, argsPrefix: [] };
  if (process.platform === "win32") return { command: "py.exe", argsPrefix: ["-3"] };
  return { command: "python3", argsPrefix: [] };
}

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

  const relayUrl = await getRelayUrl();
  const relayToken = process.env.AGENT_RELAY_TOKEN;

  const runOnRelay = async () => {
    if (!relayUrl || !relayToken) {
      throw new Error("Relay local no configurado y no se puede ejecutar Python en este servidor.");
    }
    const resp = await fetch(`${relayUrl.trim()}/landings/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${relayToken.trim()}`,
      },
      body: JSON.stringify({
        clientSlug,
        landingId,
        blogBaseUrl: client.blogBaseUrl || process.env.LANDING_BASE_URL || "",
        clientConfig: client,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Relay respondio con error: ${errText}`);
    }
    return await resp.text();
  };

  // Si estamos en Vercel, delegamos directamente al relay para evitar spawn/timeout local
  if (process.env.VERCEL === "1") {
    try {
      const html = await runOnRelay();
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (err: any) {
      return new NextResponse(`No se pudo generar la preview via relay.\n${err.message}`, { status: 500 });
    }
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
    const python = pythonCommand();
    const { stdout } = await execFileAsync(python.command, [...python.argsPrefix, ...args], {
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
  } catch (error: any) {
    // Si la ejecucion local fallo porque no se encontro Python (ENOENT), intentamos via relay
    if (error?.code === "ENOENT" && relayUrl && relayToken) {
      try {
        const html = await runOnRelay();
        return new NextResponse(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      } catch (relayErr: any) {
        return new NextResponse(`No se pudo generar la preview localmente ni via relay.\n${relayErr.message}`, { status: 500 });
      }
    }
    const message = error instanceof Error ? error.message : "Error desconocido";
    return new NextResponse(`No se pudo generar la preview.\n${message}`, { status: 500 });
  }
}
