import "server-only";

/**
 * Sunucu tarafı ortam değişkenleri. İstemciye asla sızmaz.
 * Eksik bir değişken ilk kullanımda anlaşılır bir hata fırlatır —
 * böylece build sırasında değil, ilgili özellik kullanıldığında görülür.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Ortam değişkeni eksik: ${name}. .env.local dosyasını kontrol edin.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get workerSecret() {
    return required("WORKER_SECRET");
  },
  get siteUrl() {
    return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  },
  /** Fallback provider anahtarları — asıl kaynak ai_providers tablosudur. */
  providerKeys: {
    get anthropic() {
      return optional("ANTHROPIC_API_KEY");
    },
    get openai() {
      return optional("OPENAI_API_KEY");
    },
    get google() {
      return optional("GOOGLE_API_KEY");
    },
  },
} as const;
