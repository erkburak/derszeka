import { Button } from "@/components/ui/button";
import {
  Alert,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createAdminSupabase } from "@/lib/supabase/server";
import { updateLegalAction, updateSettingsAction } from "@/app/admin/actions";

export const metadata = { title: "Sistem Ayarları" };
export const dynamic = "force-dynamic";

const SECTIONS: {
  title: string;
  description?: string;
  fields: { key: string; label: string; type?: string; hint?: string }[];
}[] = [
  {
    title: "Site",
    fields: [
      { key: "site_name", label: "Site adı" },
      { key: "site_description", label: "Site açıklaması" },
      { key: "site_logo_url", label: "Logo URL" },
      { key: "site_favicon_url", label: "Favicon URL" },
      { key: "support_email", label: "Destek e-postası", type: "email" },
    ],
  },
  {
    title: "Premium ve ödeme",
    description: "Premium sayfasında gösterilen fiyat ve banka bilgileri.",
    fields: [
      { key: "premium_price", label: "Premium fiyatı", type: "number" },
      { key: "premium_currency", label: "Para birimi" },
      { key: "bank_name", label: "Banka adı" },
      { key: "bank_account_holder", label: "Hesap sahibi" },
      { key: "bank_iban", label: "IBAN" },
      {
        key: "bank_transfer_note",
        label: "Ödeme açıklaması",
        hint: "{kullanici} yerine kullanıcının e-postası yazılır.",
      },
    ],
  },
  {
    title: "Yapay zekâ",
    description: "Maliyet hesabı ve RAG davranışı.",
    fields: [
      {
        key: "usd_try_rate",
        label: "USD/TRY kuru",
        type: "number",
        hint: "AI maliyetlerini TL'ye çevirmek için kullanılır.",
      },
      { key: "ai_effort", label: "AI çaba seviyesi", hint: "low, medium veya high" },
      { key: "rag_chunk_size", label: "RAG parça boyutu (karakter)", type: "number" },
      { key: "rag_chunk_overlap", label: "RAG örtüşme (karakter)", type: "number" },
      { key: "rag_top_k", label: "RAG getirilen parça sayısı", type: "number" },
    ],
  },
  {
    title: "Güvenlik ve limitler",
    fields: [
      { key: "max_upload_files", label: "Tek seferde maks. dosya", type: "number" },
      {
        key: "rate_limit_ai_per_minute",
        label: "Dakikada maks. AI isteği",
        type: "number",
      },
      {
        key: "rate_limit_upload_per_hour",
        label: "Saatte maks. yükleme",
        type: "number",
      },
      { key: "login_max_attempts", label: "Maks. başarısız giriş", type: "number" },
      { key: "login_lockout_minutes", label: "Kilit süresi (dk)", type: "number" },
    ],
  },
];

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings(true);

  const supabase = createAdminSupabase();
  const { data: legalDocs } = await supabase
    .from("legal_documents")
    .select("slug, title, content, updated_at")
    .order("slug", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Sistem Ayarları
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Site bilgileri, ödeme, yapay zekâ ve güvenlik ayarları.
        </p>
      </div>

      <form action={updateSettingsAction} className="space-y-6">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle>{section.title}</CardTitle>
              {section.description ? (
                <p className="text-sm text-ink-500">{section.description}</p>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {section.fields.map((field) => (
                <div key={field.key}>
                  <Label htmlFor={`setting-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`setting-${field.key}`}
                    name={`setting.${field.key}`}
                    type={field.type ?? "text"}
                    step={field.type === "number" ? "any" : undefined}
                    defaultValue={String(
                      settings[field.key as keyof typeof settings] ?? "",
                    )}
                  />
                  {field.hint ? (
                    <p className="mt-1 text-xs text-ink-400">{field.hint}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Bakım modu</CardTitle>
          </CardHeader>
          <CardContent>
            <input type="hidden" name="_boolean.maintenance_mode" value="1" />
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
              <input
                type="checkbox"
                name="setting.maintenance_mode"
                defaultChecked={Boolean(settings.maintenance_mode)}
                className="size-4 rounded border-line text-brand-600 focus:ring-brand-400"
              />
              Bakım modunu aç (yeni yüklemeler ve AI istekleri durur)
            </label>
          </CardContent>
        </Card>

        <Button type="submit" size="lg">
          Ayarları kaydet
        </Button>
      </form>

      <Alert tone="brand">
        KVKK, gizlilik ve kullanım koşulları metinleri aşağıdan düzenlenebilir.
      </Alert>

      <div className="space-y-4">
        {(legalDocs ?? []).map((doc) => (
          <Card key={doc.slug}>
            <CardHeader>
              <CardTitle>{doc.title}</CardTitle>
              <p className="font-mono text-xs text-ink-400">/{doc.slug}</p>
            </CardHeader>
            <CardContent>
              <form action={updateLegalAction} className="space-y-3">
                <input type="hidden" name="slug" value={doc.slug} />
                <div>
                  <Label htmlFor={`legal-title-${doc.slug}`}>Başlık</Label>
                  <Input
                    id={`legal-title-${doc.slug}`}
                    name="title"
                    defaultValue={doc.title as string}
                  />
                </div>
                <div>
                  <Label htmlFor={`legal-content-${doc.slug}`}>
                    İçerik (Markdown)
                  </Label>
                  <Textarea
                    id={`legal-content-${doc.slug}`}
                    name="content"
                    rows={10}
                    defaultValue={doc.content as string}
                    className="scroll-slim font-mono text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="secondary">
                  Kaydet
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
