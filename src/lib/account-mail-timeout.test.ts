import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Socket } from "node:net";
import { sendAccountEmail } from "./mailer";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const message = { to: "fixture@example.test", subject: "Test", text: "Test", html: "<p>Test</p>" };
describe("envíos de cuenta con plazo máximo", () => {
  it("cancela Resend al agotar el plazo, incluyendo respuestas que nunca llegan", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-only");
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const start = Date.now();
    expect(await sendAccountEmail(message, { timeoutMs: 100 })).toBe(false);
    expect(Date.now() - start).toBeLessThan(1500);
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  });
  it("cierra el socket SMTP real cuando el servidor no responde", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    let socket: Socket | undefined;
    let closed!: () => void;
    const socketClosed = new Promise<void>(resolve => { closed = resolve; });
    const server = createServer(connection => { socket = connection; connection.on("close", closed); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No local test port");
    vi.stubEnv("NURTURE_SMTP_HOST", "127.0.0.1"); vi.stubEnv("NURTURE_SMTP_PORT", String(address.port));
    vi.stubEnv("NURTURE_SMTP_USER", "test-only"); vi.stubEnv("NURTURE_SMTP_PASS", "test-only");
    try {
      expect(await sendAccountEmail(message, { timeoutMs: 150 })).toBe(false);
      await Promise.race([socketClosed, new Promise((_, reject) => setTimeout(() => reject(new Error("SMTP socket stayed open")), 1000))]);
      expect(socket?.destroyed).toBe(true);
    } finally { socket?.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
