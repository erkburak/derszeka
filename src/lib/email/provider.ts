import "server-only";

import nodemailer from "nodemailer";
import { decryptSecret } from "@/lib/security/crypto";
import { createAdminSupabase } from "@/lib/supabase/server";

export type EmailProviderName = "resend" | "smtp" | "disabled";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSettings {
  provider: EmailProviderName;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  apiKey: string | null;
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    password: string | null;
  };
}

/** Sağlayıcıdan bağımsız gönderim arayüzü — AI katmanıyla aynı mantık. */
export interface EmailSender {
  readonly name: EmailProviderName;
  send(message: EmailMessage, settings: EmailSettings): Promise<void>;
}

export class EmailError extends Error {
  constructor(
    message: string,
    readonly technicalMessage: string,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

class ResendSender implements EmailSender {
  readonly name = "resend" as const;

  async send(message: EmailMessage, settings: EmailSettings) {
    if (!settings.apiKey) {
      throw new EmailError(
        "E-posta gönderilemedi.",
        "resend api key missing",
      );
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `${settings.fromName} <${settings.fromEmail}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new EmailError(
        "E-posta gönderilemedi.",
        `resend ${response.status}: ${detail.slice(0, 300)}`,
      );
    }
  }
}

class SmtpSender implements EmailSender {
  readonly name = "smtp" as const;

  async send(message: EmailMessage, settings: EmailSettings) {
    const { host, port, secure, user, password } = settings.smtp;
    if (!host) {
      throw new EmailError("E-posta gönderilemedi.", "smtp host missing");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });

    try {
      await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
      });
    } catch (error) {
      throw new EmailError(
        "E-posta gönderilemedi.",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      transporter.close();
    }
  }
}

interface SettingsRow {
  provider: EmailProviderName;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  api_key_encrypted: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean;
  smtp_user: string | null;
  smtp_password_encrypted: string | null;
}

function decryptOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

export async function loadEmailSettings(): Promise<EmailSettings> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("email_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const row = (data ?? null) as SettingsRow | null;

  return {
    provider: row?.provider ?? "disabled",
    fromName: row?.from_name ?? "Ders Zeka",
    fromEmail: row?.from_email ?? "bildirim@derszeka.com",
    replyTo: row?.reply_to ?? null,
    // Ortam değişkeni yalnızca fallback; asıl kaynak admin panelidir.
    apiKey: decryptOrNull(row?.api_key_encrypted ?? null) ?? process.env.RESEND_API_KEY ?? null,
    smtp: {
      host: row?.smtp_host ?? null,
      port: Number(row?.smtp_port ?? 587),
      secure: Boolean(row?.smtp_secure),
      user: row?.smtp_user ?? null,
      password: decryptOrNull(row?.smtp_password_encrypted ?? null),
    },
  };
}

export function resolveSender(provider: EmailProviderName): EmailSender | null {
  if (provider === "resend") return new ResendSender();
  if (provider === "smtp") return new SmtpSender();
  return null;
}
