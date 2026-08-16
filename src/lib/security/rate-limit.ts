import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

export class RateLimitError extends Error {
  readonly status = 429;
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Veritabanı destekli sabit pencereli sınırlayıcı.
 * Bellek yerine DB kullanır; böylece çok örnekli (serverless) dağıtımda da çalışır.
 */
export async function enforceRateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  if (limit <= 0) return;

  const now = Date.now();
  const windowStart = new Date(
    Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000,
  ).toISOString();

  const supabase = createAdminSupabase();
  const { data, error } = await supabase.rpc("bump_rate_limit", {
    p_key: `${bucket}:${identifier}`,
    p_window_start: windowStart,
  });

  // Sınırlayıcı çökerse isteği engelleme — güvenlik değil, koruma katmanıdır.
  if (error) return;

  if (Number(data) > limit) {
    const retryAfter = Math.ceil(
      (new Date(windowStart).getTime() + windowSeconds * 1000 - now) / 1000,
    );
    throw new RateLimitError(
      "Çok fazla istek gönderdin. Lütfen biraz bekleyip tekrar dene.",
      Math.max(retryAfter, 1),
    );
  }
}

/** İstemci IP'sini proxy başlıklarından güvenli şekilde çıkarır. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/** Giriş denemesi kaydı — brute-force koruması için. */
export async function recordLoginAttempt(
  email: string | null,
  ip: string,
  success: boolean,
) {
  const supabase = createAdminSupabase();
  await supabase.from("login_attempts").insert({ email, ip, success });
}

export async function isLoginLocked(
  email: string,
  ip: string,
  maxAttempts: number,
  lockoutMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - lockoutMinutes * 60_000).toISOString();
  const supabase = createAdminSupabase();

  const [byEmail, byIp] = await Promise.all([
    supabase
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .eq("success", false)
      .gte("created_at", since),
    supabase
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("success", false)
      .gte("created_at", since),
  ]);

  return (byEmail.count ?? 0) >= maxAttempts || (byIp.count ?? 0) >= maxAttempts * 3;
}
