import type { AIProviderName } from "@/lib/types";

/**
 * Sağlayıcı hatalarını kullanıcı dostu mesaja çevirir.
 * `technicalMessage` yalnızca loglara/admin paneline gider.
 */
export class AIProviderError extends Error {
  readonly name = "AIProviderError";

  constructor(
    /** Kullanıcıya gösterilecek mesaj. */
    message: string,
    readonly provider: AIProviderName,
    readonly code: string,
    readonly status: number,
    readonly technicalMessage: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const FRIENDLY: Record<string, string> = {
  rate_limited:
    "Şu anda yapay zekâ servisinde yoğunluk var. Lütfen birkaç dakika sonra tekrar dene.",
  overloaded:
    "Yapay zekâ servisi geçici olarak aşırı yoğun. Birkaç dakika sonra tekrar dene.",
  timeout:
    "Yapay zekâ yanıtı zaman aşımına uğradı. Materyalin bir kısmıyla tekrar deneyebilirsin.",
  auth: "Yapay zekâ servisi yapılandırması eksik. Yöneticiye bildirildi.",
  invalid_request:
    "Bu materyal yapay zekâ tarafından işlenemedi. Farklı bir dosya deneyebilirsin.",
  content_too_large:
    "Materyal tek seferde işlenemeyecek kadar büyük. Daha küçük parçalara bölmeyi dene.",
  refusal:
    "Yapay zekâ bu içerik için yanıt üretemedi. Materyali gözden geçirip tekrar dene.",
  service_error:
    "Yapay zekâ servisinde bir sorun oluştu. Lütfen birkaç dakika sonra tekrar dene.",
};

export function friendlyMessage(code: string): string {
  return FRIENDLY[code] ?? FRIENDLY.service_error!;
}

/** HTTP durum kodundan hata sınıflandırması. */
export function classifyHttpStatus(status: number): {
  code: string;
  retryable: boolean;
} {
  if (status === 401 || status === 403) return { code: "auth", retryable: false };
  if (status === 400 || status === 422)
    return { code: "invalid_request", retryable: false };
  if (status === 413) return { code: "content_too_large", retryable: false };
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status === 408) return { code: "timeout", retryable: true };
  if (status === 529) return { code: "overloaded", retryable: true };
  if (status >= 500) return { code: "service_error", retryable: true };
  return { code: "service_error", retryable: false };
}

export function providerError(
  provider: AIProviderName,
  status: number,
  technicalMessage: string,
  codeOverride?: string,
): AIProviderError {
  const { code, retryable } = classifyHttpStatus(status);
  const finalCode = codeOverride ?? code;
  return new AIProviderError(
    friendlyMessage(finalCode),
    provider,
    finalCode,
    finalCode === "rate_limited" || finalCode === "overloaded" ? 503 : 502,
    technicalMessage,
    retryable,
  );
}
