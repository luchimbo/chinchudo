import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { getRelayUrl, getSetting } from "@/lib/settings";

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

export const PREVIEW_UNAVAILABLE = "El servicio que arma la vista previa no respondió. Reintentá en unos segundos.";
const RELAY_TIMEOUT_MS = 25_000;

async function renderOnRelay(clientSlug: string, landingId: string, client: LandingClientConfig, content?: Record<string, unknown>) {
  // Los túneles trycloudflare cambian cada vez que se reinicia el relay. La
  // URL vigente se persiste en AppSetting por el script de arranque; el env
  // queda únicamente como respaldo para instalaciones sin base compartida.
  // El runtime del blog y el relay principal saben renderizar: si uno está
  // caído o su túnel quedó viejo, se prueba el otro.
  const relayUrls = [...new Set([await getSetting("blog_runtime_relay_url"), await getRelayUrl()]
    .map(url => url?.trim().replace(/\/$/, ""))
    .filter((url): url is string => !!url))];
  const relayToken = process.env.AGENT_RELAY_TOKEN?.trim();

  if (!relayUrls.length || !relayToken) {
    throw new Error("Relay local no configurado y no se puede ejecutar Python en este servidor.");
  }

  const failures: string[] = [];
  for (const relayUrl of relayUrls) {
    try {
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
          ...(content ? { content } : {}),
        }),
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      });
      const text = await resp.text();
      if (resp.ok && text.trim()) return text;
      failures.push(`${relayUrl}: ${resp.status} ${text.slice(0, 500)}`);
    } catch (error) {
      failures.push(`${relayUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.error("[landing-html] Ningún relay pudo generar la vista previa", failures);
  throw new Error(`${PREVIEW_UNAVAILABLE}\n${failures.join("\n")}`);
}

/**
 * Renderiza un artículo con la plantilla real del blog. Con `content`, el
 * borrador sin guardar del editor se superpone al artículo guardado.
 */
export async function renderLandingHtml(client: LandingClientConfig, landingId = "", content?: Record<string, unknown>) {
  const clientSlug = client.slug;

  if (process.env.VERCEL === "1") {
    return renderOnRelay(clientSlug, landingId, client, content);
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
  if (content) args.push("--content-stdin");

  try {
    const python = pythonCommand();
    const pending = execFileAsync(python.command, [...python.argsPrefix, ...args], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 8,
      timeout: 30000,
      env: {
        ...process.env,
        LANDING_CLIENT_CONFIG_JSON: JSON.stringify(client),
      },
    });
    pending.child.stdin?.end(content ? JSON.stringify(content) : undefined);
    const { stdout } = await pending;

    const htmlStart = stdout.indexOf("<!DOCTYPE html>");
    const htmlEnd = stdout.indexOf("</html>", htmlStart);
    return htmlStart >= 0 ? stdout.slice(htmlStart, htmlEnd >= 0 ? htmlEnd + 7 : undefined) : stdout;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return renderOnRelay(clientSlug, landingId, client, content);
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
