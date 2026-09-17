import nodemailer from "nodemailer";

// SMTP compartido (variables NURTURE_SMTP_*): correo transaccional de cuentas
// (reset, verificación, invitaciones) y secuencias de nurturing del blog.

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

export async function sendAccountEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const client = getTransporter();
  if (!client) {
    console.error("[mailer] NURTURE_SMTP_* no configurado; no se pudo enviar el email de cuenta.");
    return false;
  }
  const from = process.env.NURTURE_FROM_EMAIL || process.env.NURTURE_SMTP_USER || "no-reply@pcmidicenter.com";
  try {
    await client.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    return true;
  } catch (err) {
    console.error("[mailer] Falló el envío", err);
    return false;
  }
}

/** Emails de nurturing: remitente con nombre ("Bruno de PC MIDI Labs"). */
export async function sendNurtureEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const client = getTransporter();
  if (!client) {
    console.error("[mailer] NURTURE_SMTP_* no configurado; no se pudo enviar el email de nurturing.");
    return false;
  }
  const address = process.env.NURTURE_FROM_EMAIL || process.env.NURTURE_SMTP_USER || "lab@pcmidicenter.com";
  const name = process.env.NURTURE_FROM_NAME || "Bruno de PC MIDI Labs";
  try {
    await client.sendMail({ from: { name, address }, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text });
    return true;
  } catch (err) {
    console.error("[mailer] Falló el envío de nurturing", err);
    return false;
  }
}
