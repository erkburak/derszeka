import { Mail, Send, TestTube } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createAdminSupabase } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import {
  sendTestEmailAction,
  updateEmailSettingsAction,
  updateEmailTemplateAction,
} from "@/app/admin/actions";

export const metadata = { title: "E-posta" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  sent: "success",
  failed: "danger",
  skipped: "warning",
  queued: "neutral",
};

const VARIABLE_HINTS: Record<string, string> = {
  welcome: "{{ad}}, {{site_name}}, {{site_url}}",
  premium_activated: "{{ad}}, {{bitis_tarihi}}, {{site_url}}",
  premium_expiring: "{{ad}}, {{kalan_gun}}, {{bitis_tarihi}}, {{site_url}}",
  payment_approved: "{{ad}}, {{tutar}}, {{bitis_tarihi}}, {{site_url}}",
  payment_rejected: "{{ad}}, {{sebep}}, {{site_url}}",
  document_ready: "{{ad}}, {{materyal}}, {{materyal_id}}, {{site_url}}",
  study_reminder: "{{ad}}, {{dakika}}, {{tekrar_bilgisi}}, {{site_url}}",
  badge_earned: "{{ad}}, {{rozet}}, {{rozet_aciklama}}, {{site_url}}",
};

export default async function AdminEmailPage() {
  await requireAdmin();
  const settings = await getSettings(true);
  const supabase = createAdminSupabase();

  const [{ data: emailSettings }, { data: templates }, { data: logs }] =
    await Promise.all([
      supabase.from("email_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("email_templates").select("*").order("key", { ascending: true }),
      supabase
        .from("email_log")
        .select("id, to_email, template_key, subject, status, provider, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const provider = (emailSettings?.provider as string) ?? "disabled";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          E-posta
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Sağlayıcı yapılandırması, şablonlar ve gönderim geçmişi.
        </p>
      </div>

      {!settings.email_enabled ? (
        <Alert tone="warning">
          E-posta gönderimi şu anda <strong>kapalı</strong>. Aşağıdan açabilirsin.
          Kapalıyken tetiklenen e-postalar &ldquo;atlandı&rdquo; olarak loglanır.
        </Alert>
      ) : null}

      {/* Sağlayıcı ayarları */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Mail className="size-4 text-brand-600" aria-hidden />
            Sağlayıcı
          </CardTitle>
          <Badge tone={settings.email_enabled ? "success" : "neutral"}>
            {settings.email_enabled ? "Açık" : "Kapalı"}
          </Badge>
        </CardHeader>
        <CardContent>
          <form action={updateEmailSettingsAction} className="space-y-5">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                name="emailEnabled"
                defaultChecked={Boolean(settings.email_enabled)}
                className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
              />
              E-posta gönderimini etkinleştir
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="provider">Sağlayıcı</Label>
                <Select id="provider" name="provider" defaultValue={provider}>
                  <option value="disabled">Devre dışı</option>
                  <option value="resend">Resend (HTTP API)</option>
                  <option value="smtp">SMTP</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="fromName">Gönderen adı</Label>
                <Input
                  id="fromName"
                  name="fromName"
                  defaultValue={(emailSettings?.from_name as string) ?? "Ders Zeka"}
                />
              </div>

              <div>
                <Label htmlFor="fromEmail">Gönderen adresi</Label>
                <Input
                  id="fromEmail"
                  name="fromEmail"
                  type="email"
                  defaultValue={
                    (emailSettings?.from_email as string) ?? "bildirim@derszeka.com"
                  }
                />
              </div>

              <div>
                <Label htmlFor="replyTo">Yanıt adresi (opsiyonel)</Label>
                <Input
                  id="replyTo"
                  name="replyTo"
                  type="email"
                  defaultValue={(emailSettings?.reply_to as string) ?? ""}
                  placeholder={settings.support_email}
                />
              </div>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="mb-3 text-sm font-medium text-ink-900">Resend</p>
              <Label htmlFor="apiKey">API anahtarı</Label>
              <Input
                id="apiKey"
                name="apiKey"
                type="password"
                autoComplete="off"
                placeholder={
                  emailSettings?.api_key_hint
                    ? `Kayıtlı: ${emailSettings.api_key_hint}`
                    : "re_..."
                }
              />
              <p className="mt-1.5 text-xs text-ink-400">
                Boş bırakırsan mevcut anahtar korunur. Alan adının Resend&apos;de
                doğrulanmış olması gerekir.
              </p>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="mb-3 text-sm font-medium text-ink-900">SMTP</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="smtpHost">Sunucu</Label>
                  <Input
                    id="smtpHost"
                    name="smtpHost"
                    defaultValue={(emailSettings?.smtp_host as string) ?? ""}
                    placeholder="smtp.yandex.com"
                  />
                </div>
                <div>
                  <Label htmlFor="smtpPort">Port</Label>
                  <Input
                    id="smtpPort"
                    name="smtpPort"
                    type="number"
                    defaultValue={Number(emailSettings?.smtp_port ?? 587)}
                  />
                </div>
                <div>
                  <Label htmlFor="smtpUser">Kullanıcı</Label>
                  <Input
                    id="smtpUser"
                    name="smtpUser"
                    defaultValue={(emailSettings?.smtp_user as string) ?? ""}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <Label htmlFor="smtpPassword">Şifre</Label>
                  <Input
                    id="smtpPassword"
                    name="smtpPassword"
                    type="password"
                    autoComplete="off"
                    placeholder={
                      emailSettings?.smtp_password_encrypted
                        ? "Kayıtlı — değiştirmek için yaz"
                        : ""
                    }
                  />
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  name="smtpSecure"
                  defaultChecked={Boolean(emailSettings?.smtp_secure)}
                  className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
                />
                SSL/TLS kullan (genelde port 465)
              </label>
            </div>

            <Button type="submit">Ayarları kaydet</Button>
          </form>
        </CardContent>
      </Card>

      {/* Test */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="size-4 text-accent-600" aria-hidden />
            Test e-postası
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={sendTestEmailAction} className="flex flex-col gap-3 sm:flex-row">
            <Input
              name="to"
              type="email"
              placeholder="test@ornek.com"
              required
              className="sm:flex-1"
            />
            <Button type="submit" variant="secondary">
              <Send aria-hidden />
              Gönder
            </Button>
          </form>
          <p className="mt-2 text-xs text-ink-400">
            Sonucu aşağıdaki gönderim geçmişinde görebilirsin.
          </p>
        </CardContent>
      </Card>

      {/* Şablonlar */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-ink-900">Şablonlar</h2>
        {(templates ?? []).map((template) => (
          <Card key={template.key as string}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{template.name}</CardTitle>
                <p className="text-sm text-ink-500">{template.description}</p>
              </div>
              <Badge tone={template.is_enabled ? "success" : "neutral"}>
                {template.is_enabled ? "Aktif" : "Kapalı"}
              </Badge>
            </CardHeader>
            <CardContent>
              <form action={updateEmailTemplateAction} className="space-y-3">
                <input type="hidden" name="key" value={template.key as string} />

                <div>
                  <Label htmlFor={`subject-${template.key}`}>Konu</Label>
                  <Input
                    id={`subject-${template.key}`}
                    name="subject"
                    defaultValue={template.subject as string}
                  />
                </div>

                <div>
                  <Label htmlFor={`body-${template.key}`}>Gövde (Markdown)</Label>
                  <Textarea
                    id={`body-${template.key}`}
                    name="body"
                    rows={10}
                    defaultValue={template.body as string}
                    className="scroll-slim font-mono text-xs"
                  />
                  <p className="mt-1.5 text-xs text-ink-400">
                    Kullanılabilir değişkenler:{" "}
                    <code className="rounded bg-surface-sunken px-1 py-0.5">
                      {VARIABLE_HINTS[template.key as string] ?? "{{ad}}, {{site_url}}"}
                    </code>
                  </p>
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    name="isEnabled"
                    defaultChecked={Boolean(template.is_enabled)}
                    className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
                  />
                  Bu şablon aktif
                </label>

                <Button type="submit" size="sm" variant="secondary">
                  Kaydet
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gönderim geçmişi */}
      <Card>
        <CardHeader>
          <CardTitle>Gönderim geçmişi</CardTitle>
        </CardHeader>
        <CardContent className="scroll-slim overflow-x-auto p-0">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-line bg-surface-muted text-left">
              <tr className="text-xs tracking-wide text-ink-500 uppercase">
                <th className="px-4 py-3 font-medium">Tarih</th>
                <th className="px-4 py-3 font-medium">Alıcı</th>
                <th className="px-4 py-3 font-medium">Şablon</th>
                <th className="px-4 py-3 font-medium">Konu</th>
                <th className="px-4 py-3 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(logs ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-400">
                    Henüz gönderim yok.
                  </td>
                </tr>
              ) : (
                (logs ?? []).map((row) => (
                  <tr key={row.id as string}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-ink-500">
                      {formatDate(row.created_at as string, true)}
                    </td>
                    <td className="px-4 py-3 text-ink-700">{row.to_email}</td>
                    <td className="px-4 py-3 text-xs text-ink-500">
                      {row.template_key}
                    </td>
                    <td className="max-w-64 truncate px-4 py-3 text-ink-700">
                      {row.subject}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[row.status as string] ?? "neutral"}>
                        {row.status}
                      </Badge>
                      {row.error_message ? (
                        <p className="mt-1 max-w-64 truncate text-xs text-danger-700">
                          {row.error_message}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
