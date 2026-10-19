import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ rate: vi.fn(), mail: vi.fn(), sign: vi.fn(), hash: vi.fn(), db: {
  user: { findUnique: vi.fn(), create: vi.fn() }, client: { findFirst: vi.fn(), create: vi.fn() },
  channel: { upsert: vi.fn() }, clientOnboarding: { create: vi.fn() }, emailVerificationToken: { create: vi.fn() }, $transaction: vi.fn(),
} }));
vi.mock("./db", () => ({ prisma: mocks.db }));
vi.mock("./rate-limit", () => ({ checkRateLimit: mocks.rate }));
vi.mock("./mailer", () => ({ sendAccountEmail: mocks.mail }));
vi.mock("./auth-crypto", () => ({ hashPassword: mocks.hash, signJwt: mocks.sign }));
import { POST } from "@/app/api/auth/register/route";
const valid = { name: " Ana ", clientName: " Música Norte ", email: " ANA@EXAMPLE.TEST ", password: "Test-only-phrase-42" };
const request = (body: unknown) => new NextRequest("https://suite.test/api/auth/register", { method: "POST", headers: { "x-forwarded-for": "192.0.2.1" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("AUTH_SECRET", "test-only-key"); vi.stubEnv("CLIENT_APP_URL", "https://suite.test");
  mocks.rate.mockResolvedValue({ allowed: true }); mocks.hash.mockReturnValue("hashed-test-password"); mocks.sign.mockReturnValue("signed-test-token");
  mocks.db.user.findUnique.mockResolvedValue(null); mocks.db.client.findFirst.mockResolvedValue(null);
  mocks.db.client.create.mockImplementation(async ({ data }) => ({ id: "client-a", ...data }));
  mocks.db.user.create.mockImplementation(async ({ data }) => ({ id: "user-a", ...data }));
  mocks.db.$transaction.mockImplementation(async callback => callback(mocks.db));
  mocks.mail.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe("registro simple y seguro ante reintentos", () => {
  it("normaliza los datos, crea todo en una transacción y entrega la sesión", async () => {
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, next: "/onboarding?client=musica-norte" });
    expect(response.cookies.get("auth_session")?.value).toBe("signed-test-token");
    expect(mocks.db.client.create.mock.calls[0][0].data).toMatchObject({ name: "Música Norte", slug: "musica-norte", description: "" });
    expect(mocks.db.user.create.mock.calls[0][0].data).toMatchObject({ email: "ana@example.test", name: "Ana", passwordHash: "hashed-test-password", clientId: "client-a" });
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 15000, maxWait: 3000 });
    expect(mocks.mail).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.test", html: expect.stringContaining("Cafishia") }), { timeoutMs: 3000 });
    expect(mocks.db.emailVerificationToken.create.mock.calls[0][0].data.tokenHash).not.toContain("token=");
  });
  it("un fallo del correo no convierte una cuenta creada en un error", async () => {
    mocks.mail.mockRejectedValue(new Error("Mail unavailable"));
    const response = await POST(request(valid));
    expect(response.status).toBe(200); expect(response.cookies.get("auth_session")).toBeDefined();
    expect(mocks.db.client.create).toHaveBeenCalledTimes(1);
  });
  it("un reintento con un email existente ofrece ingresar sin volver a crear el espacio", async () => {
    mocks.db.user.findUnique.mockResolvedValue({ id: "existing" });
    const response = await POST(request(valid));
    expect(response.status).toBe(409);
    expect((await response.json()).fieldErrors.email).toHaveLength(1);
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("convierte el conflicto de una creación simultánea en una respuesta entendible", async () => {
    mocks.db.$transaction.mockRejectedValue({ code: "P2002", message: "private DB detail" });
    const response = await POST(request(valid));
    expect(response.status).toBe(409);
    const text = await response.text(); expect(text).toContain("Intentá ingresar"); expect(text).not.toContain("private DB");
    expect(mocks.mail).not.toHaveBeenCalled();
  });
  it.each([{ ...valid, name: " " }, { ...valid, clientName: " " }, { ...valid, email: "not-an-email" }, { ...valid, password: 42 }])("indica los campos inválidos antes de escribir datos", async values => {
    const response = await POST(request(values));
    expect(response.status).toBe(400); expect((await response.json()).fieldErrors).toBeDefined();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("rechaza una contraseña corta con un error asociado al campo", async () => {
    const response = await POST(request({ ...valid, password: "123" }));
    expect(response.status).toBe(400); expect((await response.json()).fieldErrors.password[0]).toContain("10 caracteres");
    expect(mocks.hash).not.toHaveBeenCalled();
  });
  it("conserva el límite de intentos", async () => {
    mocks.rate.mockResolvedValue({ allowed: false, resetInMs: 5000 });
    const response = await POST(request(valid)); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("5");
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("los errores de infraestructura no revelan detalles internos", async () => {
    mocks.db.user.findUnique.mockRejectedValue(new Error("postgresql://private-password"));
    const response = await POST(request(valid)); expect(response.status).toBe(500); expect(await response.text()).not.toContain("postgresql");
  });
});
