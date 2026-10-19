import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { connect, type Socket } from "node:net";
import { withAbortSignal } from "./abortable";

// Dos transportes: Resend (HTTP, preferido cuando hay RESEND_API_KEY) y el SMTP
// del hosting (NURTURE_SMTP_*) como respaldo. El SMTP del hosting entrega, pero
// su firma DKIM no valida en destino y Gmail descarta los mensajes.

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.NURTURE_SMTP_HOST;
  const port = Number(process.env.NURTURE_SMTP_PORT || 465);
  const user = process.env.NURTURE_SMTP_USER;
  const pass = process.env.NURTURE_SMTP_PASS;
  if (!host || !user || !pass) return null;
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return transporter;
}

type Message = { to: string; subject: string; html: string; text: string; fromName?: string };

function fromAddress(): string {
  return process.env.NURTURE_FROM_EMAIL || process.env.NURTURE_SMTP_USER || "lab@pcmidicenter.com";
}

async function sendWithResend(message: Message, apiKey: string, signal?: AbortSignal): Promise<boolean> {
  const address = fromAddress();
  const from = message.fromName ? `${message.fromName} <${address}>` : address;
  try {
    const pending = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal,
    });
    const response = await (signal ? withAbortSignal(pending, signal) : pending);
    const body = response.json().catch(() => ({}));
    const payload = (await (signal ? withAbortSignal(body, signal) : body)) as { id?: string; message?: string; name?: string };
    if (!response.ok) {
      console.error(`[mailer] Resend rechazó el envío (${response.status}): ${payload.name ?? ""} ${payload.message ?? ""}`);
      return false;
    }
    console.log(`[mailer] Resend aceptó el envío a ${message.to} (id ${payload.id ?? "sin id"})`);
    return true;
  } catch (err) {
    console.error("[mailer] Falló la llamada a Resend", err);
    return false;
  }
}

async function sendWithSmtp(message: Message, signal?: AbortSignal): Promise<boolean> {
  let socket: Socket | undefined;
  const host = process.env.NURTURE_SMTP_HOST;
  const port = Number(process.env.NURTURE_SMTP_PORT || 465);
  const user = process.env.NURTURE_SMTP_USER;
  const pass = process.env.NURTURE_SMTP_PASS;
  // An account email owns its socket, so the deadline closes DNS/TCP/TLS/SMTP work,
  // rather than merely abandoning a promise or closing a shared transporter.
  const client = signal && host && user && pass ? nodemailer.createTransport({
    host, port, secure: port === 465, auth: { user, pass },
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 3000,
    getSocket(_options: SMTPTransport.Options, callback: (error: Error | null, socketOptions: object) => void) {
      if (signal.aborted) { callback(new Error("Se agotó el tiempo de envío."), {}); return; }
      socket = connect({ host, port, signal });
      const onError = (error: Error) => callback(error, {});
      socket.once("error", onError);
      socket.once("connect", () => { socket!.removeListener("error", onError); callback(null, { connection: socket }); });
    },
  }) : getTransporter();
  if (!client) {
    console.error("[mailer] Sin RESEND_API_KEY ni NURTURE_SMTP_*: no se pudo enviar el email.");
    return false;
  }
  const address = fromAddress();
  try {
    signal?.throwIfAborted();
    const pending = client.sendMail({
      from: message.fromName ? { name: message.fromName, address } : address,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    const info = await (signal ? withAbortSignal(pending, signal) : pending);
    console.log(`[mailer] SMTP aceptó el envío a ${message.to} (${info.messageId}): ${info.response}`);
    return true;
  } catch (err) {
    console.error("[mailer] Falló el envío por SMTP", err);
    return false;
  } finally {
    if (signal) { socket?.destroy(); client.close(); }
  }
}

/** Envía por Resend si hay API key; si no, por el SMTP del hosting. */
export async function sendEmail(message: Message, signal?: AbortSignal): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? sendWithResend(message, apiKey, signal) : sendWithSmtp(message, signal);
}

export async function sendAccountEmail(opts: { to: string; subject: string; html: string; text: string }, options: { timeoutMs?: number } = {}): Promise<boolean> {
  return sendEmail(opts, options.timeoutMs ? AbortSignal.timeout(options.timeoutMs) : undefined);
}

/** Emails de nurturing: remitente con nombre ("Bruno de PC MIDI Labs"). */
export async function sendNurtureEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  return sendEmail({ ...opts, fromName: process.env.NURTURE_FROM_NAME || "Bruno de PC MIDI Labs" });
}
