import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
vi.mock("../social-token-crypto", () => ({ decryptSocialToken: (value: string) => value }));
import { commentIdFromUrl, publishYouTubeComment } from "../youtube-publisher";
const db = () => ({ youTubeConnection: { findUnique: vi.fn(async () => ({ id: "connection", accessToken: "test-token", refreshToken: "test-refresh", expiresAt: new Date(Date.now() + 3600_000) })) } });
const input = (mock: ReturnType<typeof db>) => ({ prisma: mock as unknown as PrismaClient, clientId: "client", account: "account", sourceUrl: "https://www.youtube.com/watch?v=video&lc=parent", text: "Respuesta revisada" });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
  it("una respuesta dentro de un hilo se publica en el comentario principal", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ id: "remote-comment" }), { status: 200 })); vi.stubGlobal("fetch", fetch);
    await publishYouTubeComment({ ...input(db()), sourceUrl: "https://www.youtube.com/watch?v=video&lc=parent.reply" });
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({ body: JSON.stringify({ snippet: { parentId: "parent", textOriginal: "Respuesta revisada" } }) }));
    expect(commentIdFromUrl("https://www.youtube.com/watch?v=video")).toBeNull();
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
  it("conserva el código de Google cuando falla la renovación del token", async () => {
    vi.stubEnv("YOUTUBE_OAUTH_CLIENT_ID", "client-id"); vi.stubEnv("YOUTUBE_OAUTH_CLIENT_SECRET", "client-secret");
    const mock = db(); mock.youTubeConnection.findUnique.mockResolvedValue({ id: "connection", accessToken: "test-token", refreshToken: "test-refresh", expiresAt: new Date(Date.now() - 1000) });
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }), { status: 400 })); vi.stubGlobal("fetch", fetch);
    expect(await publishYouTubeComment(input(mock))).toMatchObject({ success: false, error: "invalid_grant: Bad Request", ambiguous: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("identifica el rechazo HTTP de YouTube y limpia el mensaje remoto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Bad <code>Request</code>" } }), { status: 400 })));
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, error: "youtube_http_400: Bad Request", ambiguous: false });
  });
  it("incluye motivo y mensaje cuando YouTube informa ambos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "The comment could not be created.", errors: [{ reason: "processingFailure" }] } }), { status: 400 })));
    expect(await publishYouTubeComment(input(db()))).toMatchObject({ success: false, error: "processingFailure: The comment could not be created.", ambiguous: false });
  });
});
