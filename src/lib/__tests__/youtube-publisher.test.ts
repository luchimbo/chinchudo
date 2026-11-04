import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
vi.mock("../social-token-crypto", () => ({ decryptSocialToken: (value: string) => value }));
import { publishYouTubeComment } from "../youtube-publisher";
const db = () => ({ youTubeConnection: { findUnique: vi.fn(async () => ({ id: "connection", accessToken: "test-token", refreshToken: "test-refresh", expiresAt: new Date(Date.now() + 3600_000) })) } });
const input = (mock: ReturnType<typeof db>) => ({ prisma: mock as unknown as PrismaClient, clientId: "client", account: "account", sourceUrl: "https://www.youtube.com/watch?v=video&lc=parent", text: "Respuesta revisada" });
afterEach(() => vi.unstubAllGlobals());
describe("publicación YouTube verificada", () => {
  it("dry-run no accede a credenciales ni publica", async () => {
    const mock = db(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await publishYouTubeComment({ ...input(mock), dryRun: true })).toMatchObject({ success: true, dryRun: true });
    expect(fetch).not.toHaveBeenCalled(); expect(mock.youTubeConnection.findUnique).not.toHaveBeenCalled();
  });
  it("devuelve éxito solo después de la confirmación remota", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ id: "remote-comment" }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    const result = await publishYouTubeComment(input(db()));
    expect(result).toMatchObject({ success: true, remoteId: "remote-comment" });
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]).toEqual([expect.stringContaining("/comments?part=snippet"), expect.objectContaining({ method: "POST", body: JSON.stringify({ snippet: { parentId: "parent", textOriginal: "Respuesta revisada" } }) })]);
  });
  it("una respuesta ambigua no se reintenta automáticamente", async () => {
    const fetch = vi.fn(async () => { throw new Error("request_timeout"); }); vi.stubGlobal("fetch", fetch);
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, ambiguous: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("respeta los errores remotos de cuota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { errors: [{ reason: "quotaExceeded" }] } }), { status: 403 })));
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, error: "quotaExceeded", ambiguous: false });
  });
  it("no anuncia éxito si falta el ID de confirmación", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, ambiguous: true });
  });
  it("considera ambiguo un error del servidor después del envío", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, ambiguous: true });
  });
});
