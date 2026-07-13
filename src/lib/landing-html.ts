import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type LandingClientConfig = {
  id: string;
  name: string;
  slug: string;
  storeUrl: string;
  blogBaseUrl: string;
  labName: string;
  logoUrl: string;
  landingTemplate: string;
  landingPrimaryColor: string;
  landingSecondaryColor: string;
};

function pythonCommand() {
  const envPython = process.env.PYTHON || process.env.PYTHON_BIN;
  if (envPython) return { command: envPython, argsPrefix: [] as string[] };

  const localPython =
    process.platform === "win32"
      ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
      : path.join(process.cwd(), ".venv", "bin", "python");

  if (existsSync(localPython)) return { command: localPython, argsPrefix: [] as string[] };
  if (process.platform === "win32") return { command: "py.exe", argsPrefix: ["-3"] };
  return { command: "python3", argsPrefix: [] as string[] };
}

async function renderOnRelay(clientSlug: string, landingId: string, client: LandingClientConfig) {
  const relayUrl = process.env.AGENT_RELAY_URL?.trim();
  const relayToken = process.env.AGENT_RELAY_TOKEN?.trim();

  if (!relayUrl || !relayToken) {
    throw new Error("Relay local no configurado y no se puede ejecutar Python en este servidor.");
  }

  const resp = await fetch(`${relayUrl}/landings/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${relayToken}`,
    },
    body: JSON.stringify({
      clientSlug,
      landingId,
      blogBaseUrl: client.blogBaseUrl || process.env.LANDING_BASE_URL || "",
      clientConfig: client,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Relay respondio con error: ${await resp.text()}`);
  }

  return await resp.text();
}

export async function renderLandingHtml(client: LandingClientConfig, landingId = "") {
  const clientSlug = client.slug;

  if (process.env.VERCEL === "1") {
    return renderOnRelay(clientSlug, landingId, client);
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
    return htmlStart >= 0 ? stdout.slice(htmlStart) : stdout;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return renderOnRelay(clientSlug, landingId, client);
    }
    throw error;
  }
}

export function resolveAppBaseUrl() {
  const explicit =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "";

  if (!explicit) return "";
  if (explicit.startsWith("http://") || explicit.startsWith("https://")) return explicit.replace(/\/$/, "");
  return `https://${explicit.replace(/\/$/, "")}`;
}

export function resolvePublicLandingUrl(slug: string) {
  const pathName = `/l/${slug}`;
  const baseUrl = resolveAppBaseUrl();
  return baseUrl ? `${baseUrl}${pathName}` : pathName;
}
