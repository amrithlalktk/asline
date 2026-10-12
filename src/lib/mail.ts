import nodemailer from "nodemailer";
import { z } from "zod";

const emailListSchema = z.array(z.string().trim().email()).min(1);

// Picks who a PDF-send goes to: an explicit list from the recipient picker
// (EmailPdfButton) if one was sent, else the viewer's own saved
// notifyEmails as a fallback. Returns null when neither is usable, so
// callers can 400 instead of silently emailing no one.
export function resolveRecipients(bodyTo: unknown, fallback: string | null) {
  const parsed = emailListSchema.safeParse(bodyTo);
  if (parsed.success) return parsed.data.join(", ");
  return fallback;
}

// Reads SMTP creds from .env. Until those are set, this logs the email to
// the server console instead of sending it — lets the reset-password flow
// be tested end-to-end locally before any real mail provider is wired up.
function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: Number(SMTP_PORT ?? 587) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

export async function sendMail({
  to,
  subject,
  text,
  attachments,
}: {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}) {
  const transport = getTransport();
  if (!transport) {
    console.log(
      `\n[mail] SMTP_HOST not set in .env — logging email instead of sending it.\n` +
        `[mail] To: ${to}\n[mail] Subject: ${subject}\n[mail] Body:\n${text}\n` +
        (attachments?.length
          ? `[mail] Attachments: ${attachments.map((a) => a.filename).join(", ")}\n`
          : "")
    );
    return;
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@localhost",
    to,
    subject,
    text,
    attachments,
  });
}
