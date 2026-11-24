import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/db", () => ({ prisma: { appSetting: { findUnique: vi.fn(async ({ where }: { where: { key: string } }) => rows.has(where.key) ? { value: rows.get(where.key) } : null) } } }));
import { getLocalLlmRelayUrl } from "../settings";

describe("ruta de la web a la IA local", () => {
  beforeEach(() => { rows.clear(); delete process.env.AGENT_RELAY_URL; });
  it("usa el túnel del servidor pcmidi aunque esté el relay de la PC", async () => {
    rows.set("blog_runtime_relay_url", "https://server.trycloudflare.com");
    rows.set("AGENT_RELAY_URL", "https://pc.trycloudflare.com");
    expect(await getLocalLlmRelayUrl()).toBe("https://server.trycloudflare.com");
  });
  it("sin túnel del servidor, usa el relay de la PC", async () => {
    rows.set("AGENT_RELAY_URL", "https://pc.trycloudflare.com");
    expect(await getLocalLlmRelayUrl()).toBe("https://pc.trycloudflare.com");
  });
});
