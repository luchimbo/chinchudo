export function getRelayUrl() {
  const url = process.env.AGENT_RELAY_URL;
  if (!url) throw new Error("AGENT_RELAY_URL no configurado.");
  return url.replace(/\/$/, "");
}

export function getRelayHeaders() {
  const token = process.env.AGENT_RELAY_TOKEN;
  if (!token) throw new Error("AGENT_RELAY_TOKEN no configurado.");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function relayFetch(path: string, init: RequestInit = {}) {
  const url = getRelayUrl();
  const headers = getRelayHeaders();
  return fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
}
