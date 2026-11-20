import { getRelayUrl, getSetting } from "@/lib/settings";

export function getRelayHeaders() {
  const token = process.env.AGENT_RELAY_TOKEN;
  if (!token) throw new Error("AGENT_RELAY_TOKEN no configurado.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// The blog runs on the SSH server and publishes its own tunnel URL; everything
// else (opportunity search, logins) goes to the relay on this PC.
const BLOG_PATHS = new Set(["/blog/publish", "/blog/health"]);

export async function relayFetch(path: string, init: RequestInit = {}) {
  const blog = BLOG_PATHS.has(path);
  const url = blog ? await getSetting("blog_runtime_relay_url") : await getRelayUrl();
  if (!url) throw new Error(blog ? "El trabajador del blog no publicó su dirección (blog_runtime_relay_url)." : "AGENT_RELAY_URL no configurado (ni en AppSetting ni en env).");
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
