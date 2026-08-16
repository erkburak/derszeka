import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

/** Kod içinde sabit yok: her ayar veritabanından, admin panelinden yönetilir. */
export const SETTING_DEFAULTS = {
  site_name: "Ders Zeka",
  site_description: "Notlarını yapay zekâ ile çalışma sistemine dönüştür.",
  site_logo_url: "",
  site_favicon_url: "",
  support_email: "destek@derszeka.com",

  premium_price: 299,
  premium_currency: "TRY",
  premium_period_days: 30,
  bank_name: "",
  bank_account_holder: "",
  bank_iban: "",
  bank_transfer_note: "Premium üyelik - {kullanici}",

  usd_try_rate: 41.5,
  rag_chunk_size: 1200,
  rag_chunk_overlap: 180,
  rag_top_k: 8,
  ai_effort: "medium",
  max_upload_files: 10,
  allowed_mime_types: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ] as string[],

  rate_limit_ai_per_minute: 10,
  rate_limit_upload_per_hour: 30,
  login_max_attempts: 8,
  login_lockout_minutes: 15,
  maintenance_mode: false,

  email_enabled: false,
  email_welcome_enabled: true,
  email_document_ready_enabled: true,
  email_reminder_enabled: true,
  email_reminder_idle_days: 3,
  email_premium_expiry_days: 3,

  leaderboard_enabled: true,

  /** Kart ve quiz üretimi ham metin yerine analiz çıktısından beslensin. */
  generation_from_study_set: true,
  flashcards_per_document_free: 12,
  flashcards_per_document_premium: 25,
  quiz_questions_per_document_free: 6,
  quiz_questions_per_document_premium: 12,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = { [K in SettingKey]: (typeof SETTING_DEFAULTS)[K] };

let cached: { at: number; value: Settings } | null = null;
const TTL_MS = 30_000;

export async function getSettings(force = false): Promise<Settings> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;

  const merged = { ...SETTING_DEFAULTS } as Record<string, unknown>;

  // Build sırasında veya servis anahtarı yokken varsayılanlarla devam et;
  // ayarlar veritabanına ulaşamamak sayfayı çökertmemeli.
  try {
    const supabase = createAdminSupabase();
    const { data } = await supabase.from("system_settings").select("key, value");
    for (const row of data ?? []) {
      if (row.key in SETTING_DEFAULTS) merged[row.key] = row.value;
    }
  } catch {
    return merged as Settings;
  }

  const value = merged as Settings;
  cached = { at: Date.now(), value };
  return value;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  return (await getSettings())[key];
}

export async function setSetting(
  key: SettingKey,
  value: unknown,
  updatedBy: string | null,
) {
  const supabase = createAdminSupabase();
  const { error } = await supabase.from("system_settings").upsert(
    { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
  cached = null;
}

/** Landing/premium sayfalarında gösterilebilecek genel ayarlar. */
export async function getPublicSettings() {
  const s = await getSettings();
  return {
    siteName: s.site_name,
    siteDescription: s.site_description,
    logoUrl: s.site_logo_url,
    faviconUrl: s.site_favicon_url,
    supportEmail: s.support_email,
    premiumPrice: s.premium_price,
    premiumCurrency: s.premium_currency,
    bankName: s.bank_name,
    bankAccountHolder: s.bank_account_holder,
    bankIban: s.bank_iban,
    bankTransferNote: s.bank_transfer_note,
    maintenanceMode: s.maintenance_mode,
    maxUploadFiles: s.max_upload_files,
    allowedMimeTypes: s.allowed_mime_types,
  };
}
