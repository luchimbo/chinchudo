import { getRelayUrl, getSetting } from "@/lib/settings";

export function getRelayHeaders() {
  const token = process.env.AGENT_RELAY_TOKEN;
  if (!token) throw new Error("AGENT_RELAY_TOKEN no configurado.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// The pcmidi server publishes its own tunnel URL and runs the blog and the manual opportunity
// search; profile logins still go to the relay on the PC MIDI PC. The search falls back to that
// relay when the server has not published its address.
const SERVER_PATHS = new Set(["/blog/publish", "/blog/health", "/search/run"]);
const SERVER_ONLY_PATHS = new Set(["/blog/publish", "/blog/health"]);

export async function relayFetch(path: string, init: RequestInit = {}) {
  const server = SERVER_PATHS.has(path) ? (await getSetting("blog_runtime_relay_url"))?.trim() || null : null;
  const serverOnly = SERVER_ONLY_PATHS.has(path);
  const url = server || (serverOnly ? null : await getRelayUrl());
  if (!url) throw new Error(serverOnly ? "El trabajador del blog no publicó su dirección (blog_runtime_relay_url)." : "AGENT_RELAY_URL no configurado (ni en AppSetting ni en env).");
  const base = url.replace(/\/$/, "");
  const headers = getRelayHeaders();
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
}
