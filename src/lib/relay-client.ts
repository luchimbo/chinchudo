import { getRelayUrl } from "@/lib/settings";

export function getRelayHeaders() {
  const token = process.env.AGENT_RELAY_TOKEN;
  if (!token) throw new Error("AGENT_RELAY_TOKEN no configurado.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function relayFetch(path: string, init: RequestInit = {}) {
  const url = await getRelayUrl();
  if (!url) throw new Error("AGENT_RELAY_URL no configurado (ni en AppSetting ni en env).");
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
