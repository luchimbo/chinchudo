import { afterEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));

async function loadMailer() {
  vi.resetModules();
  return import("../mailer");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  sendMail.mockReset();
});

const message = { to: "lead@example.com", subject: "Asunto", html: "<p>Hola</p>", text: "Hola" };

describe("sendNurtureEmail", () => {
  it("usa Resend cuando hay API key, con remitente con nombre", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NURTURE_FROM_EMAIL", "lab@pcmidicenter.com");
    vi.stubEnv("NURTURE_FROM_NAME", "Bruno de PC MIDI Labs");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "abc" }) });
    vi.stubGlobal("fetch", fetchMock);

    const { sendNurtureEmail } = await loadMailer();
    expect(await sendNurtureEmail(message)).toBe(true);
    expect(sendMail).not.toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ from: "Bruno de PC MIDI Labs <lab@pcmidicenter.com>", to: ["lead@example.com"], subject: "Asunto" });
  });

  it("devuelve false si Resend rechaza el envío", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ name: "validation_error", message: "domain not verified" }) }));
    const { sendNurtureEmail } = await loadMailer();
    expect(await sendNurtureEmail(message)).toBe(false);
  });

  it("cae al SMTP del hosting cuando no hay API key", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NURTURE_SMTP_HOST", "smtp.example.com");
    vi.stubEnv("NURTURE_SMTP_USER", "lab@pcmidicenter.com");
    vi.stubEnv("NURTURE_SMTP_PASS", "secreto");
    sendMail.mockResolvedValue({ messageId: "<id>", response: "250 OK" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendNurtureEmail } = await loadMailer();
    expect(await sendNurtureEmail(message)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: "lead@example.com", subject: "Asunto" });
  });
});
