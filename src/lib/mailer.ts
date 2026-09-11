import nodemailer from "nodemailer";

// Reutiliza las variables de nurturing por SMTP (ya presentes en
// .env.example) para el correo transaccional de cuentas (reset, verificación,
// invitaciones). El envío de nurturing en sí sigue viviendo en Python.

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
