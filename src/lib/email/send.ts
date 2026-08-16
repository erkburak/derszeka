import "server-only";

import {
  EmailError,
  loadEmailSettings,
  resolveSender,
  type EmailSettings,
} from "@/lib/email/provider";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { renderMarkdown } from "@/lib/utils";

export type EmailTemplateKey =
  | "welcome"
  | "premium_activated"
  | "premium_expiring"
  | "payment_approved"
  | "payment_rejected"
  | "document_ready"
  | "study_reminder"
  | "badge_earned";

export interface SendEmailInput {
  to: string;
  templateKey: EmailTemplateKey;
  variables: Record<string, string>;
  userId?: string | null;
  /** Kullanıcı tercihini yok say (ör. ödeme onayı gibi işlemsel e-postalar). */
  transactional?: boolean;
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) =>
    variables[key] ?? "",
  );
}

/** Markdown gövdeyi sade, e-posta istemcilerinde çalışan HTML'e sarar. */
function wrapHtml(params: {
  siteName: string;
  siteUrl: string;
  supportEmail: string;
  bodyHtml: string;
}): string {
  return `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#4f46e5,#9333ea);padding:24px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">${params.siteName}</span>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.7;color:#334155;">
          ${params.bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
          <p style="margin:0 0 6px;">Bu e-posta ${params.siteName} tarafından gönderildi.</p>
          <p style="margin:0;">Soruların için <a href="mailto:${params.supportEmail}" style="color:#4f46e5;">${params.supportEmail}</a> · <a href="${params.siteUrl}/settings" style="color:#4f46e5;">Bildirim tercihleri</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function toPlainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

async function logEmail(params: {
  userId?: string | null;
  to: string;
  templateKey: string;
  subject: string;
  status: "sent" | "failed" | "skipped";
  provider?: string;
  error?: string;
}) {
  const supabase = createAdminSupabase();
  await supabase.from("email_log").insert({
    user_id: params.userId ?? null,
    to_email: params.to,
    template_key: params.templateKey,
    subject: params.subject,
    status: params.status,
    provider: params.provider ?? null,
    error_message: params.error ?? null,
    sent_at: params.status === "sent" ? new Date().toISOString() : null,
  });
}

/**
 * Şablonu doldurup gönderir. Sağlayıcı kapalıysa veya kullanıcı
 * bildirimleri kapattıysa "skipped" olarak loglanır — hata fırlatmaz.
 */
export async function sendTemplatedEmail(input: SendEmailInput): Promise<boolean> {
  const supabase = createAdminSupabase();
  const settings = await getSettings();

  if (!settings.email_enabled) {
    await logEmail({
      ...input,
      templateKey: input.templateKey,
      subject: "(gönderilmedi)",
      status: "skipped",
      error: "email_enabled kapalı",
    });
    return false;
  }

  if (input.userId && !input.transactional) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email_notifications")
      .eq("id", input.userId)
      .maybeSingle();
    if (profile && profile.email_notifications === false) {
      await logEmail({
        ...input,
        templateKey: input.templateKey,
        subject: "(gönderilmedi)",
        status: "skipped",
        error: "kullanıcı e-posta bildirimlerini kapatmış",
      });
      return false;
    }
  }

  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body, is_enabled")
    .eq("key", input.templateKey)
    .maybeSingle();

  if (!template || template.is_enabled === false) {
    await logEmail({
      ...input,
      templateKey: input.templateKey,
      subject: "(gönderilmedi)",
      status: "skipped",
      error: "şablon bulunamadı veya kapalı",
    });
    return false;
  }

  const emailSettings: EmailSettings = await loadEmailSettings();
  const sender = resolveSender(emailSettings.provider);

  const variables: Record<string, string> = {
    site_name: settings.site_name,
    site_url: process.env.NEXT_PUBLIC_SITE_URL ?? "",
    destek_email: settings.support_email,
    ...input.variables,
  };

  const subject = fillTemplate(template.subject as string, variables);
  const bodyMarkdown = fillTemplate(template.body as string, variables);

  if (!sender) {
    await logEmail({
      ...input,
      templateKey: input.templateKey,
      subject,
      status: "skipped",
      error: "sağlayıcı yapılandırılmamış",
    });
    return false;
  }

  const html = wrapHtml({
    siteName: settings.site_name,
    siteUrl: variables.site_url!,
    supportEmail: settings.support_email,
    bodyHtml: renderMarkdown(bodyMarkdown),
  });

  try {
    await sender.send(
      { to: input.to, subject, html, text: toPlainText(bodyMarkdown) },
      emailSettings,
    );
    await logEmail({
      ...input,
      templateKey: input.templateKey,
      subject,
      status: "sent",
      provider: emailSettings.provider,
    });
    return true;
  } catch (error) {
    const technical =
      error instanceof EmailError
        ? error.technicalMessage
        : error instanceof Error
          ? error.message
          : String(error);
    console.error("[email]", input.templateKey, technical);
    await logEmail({
      ...input,
      templateKey: input.templateKey,
      subject,
      status: "failed",
      provider: emailSettings.provider,
      error: technical.slice(0, 500),
    });
    return false;
  }
}

/** Admin panelindeki "test e-postası gönder" için. */
export async function sendRawEmail(params: {
  to: string;
  subject: string;
  markdown: string;
}): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings();
  const emailSettings = await loadEmailSettings();
  const sender = resolveSender(emailSettings.provider);

  if (!sender) {
    return { ok: false, error: "E-posta sağlayıcısı yapılandırılmamış." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const html = wrapHtml({
    siteName: settings.site_name,
    siteUrl,
    supportEmail: settings.support_email,
    bodyHtml: renderMarkdown(params.markdown),
  });

  try {
    await sender.send(
      {
        to: params.to,
        subject: params.subject,
        html,
        text: toPlainText(params.markdown),
      },
      emailSettings,
    );
    await logEmail({
      to: params.to,
      templateKey: "test",
      subject: params.subject,
      status: "sent",
      provider: emailSettings.provider,
    });
    return { ok: true };
  } catch (error) {
    const technical =
      error instanceof EmailError
        ? error.technicalMessage
        : error instanceof Error
          ? error.message
          : String(error);
    await logEmail({
      to: params.to,
      templateKey: "test",
      subject: params.subject,
      status: "failed",
      provider: emailSettings.provider,
      error: technical.slice(0, 500),
    });
    return { ok: false, error: technical };
  }
}
