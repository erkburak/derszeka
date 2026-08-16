import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import type { PlanType, Profile } from "@/lib/types";

export type LimitKey =
  | "daily_ai_requests"
  | "daily_tokens"
  | "monthly_tokens"
  | "monthly_uploads"
  | "max_documents"
  | "max_file_size_mb"
  | "max_pages_per_document"
  | "monthly_flashcards"
  | "monthly_quizzes"
  | "daily_tutor_messages"
  | "max_output_tokens"
  | "daily_cost_cents"
  | "monthly_cost_cents"
  | "feature_study_plan"
  | "feature_guided_mode"
  | "feature_spaced_repetition"
  | "feature_advanced_models";

export type UsageMetric =
  | "ai_requests"
  | "tokens"
  | "uploads"
  | "flashcards"
  | "quizzes"
  | "tutor_messages"
  | "cost_cents";

/** Limit aşımı — kullanıcıya Premium yükseltme ekranı gösterilir. */
export class LimitExceededError extends Error {
  readonly status = 402;
  constructor(
    readonly limitKey: LimitKey,
    readonly limitValue: number,
    readonly current: number,
    message: string,
  ) {
    super(message);
    this.name = "LimitExceededError";
  }
}

const CACHE_TTL_MS = 30_000;
let limitCache: { at: number; value: Record<PlanType, Record<string, number>> } | null = null;

export async function getPlanLimits(): Promise<Record<PlanType, Record<string, number>>> {
  if (limitCache && Date.now() - limitCache.at < CACHE_TTL_MS) return limitCache.value;

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("plan_limits")
    .select("plan, limit_key, limit_value");

  const value: Record<PlanType, Record<string, number>> = { free: {}, premium: {} };
  for (const row of data ?? []) {
    value[row.plan as PlanType][row.limit_key] = Number(row.limit_value);
  }
  limitCache = { at: Date.now(), value };
  return value;
}

export function invalidateLimitCache() {
  limitCache = null;
}

export async function getLimit(plan: PlanType, key: LimitKey): Promise<number> {
  const limits = await getPlanLimits();
  return limits[plan]?.[key] ?? 0;
}

export async function hasFeature(
  plan: PlanType,
  key: Extract<LimitKey, `feature_${string}`>,
): Promise<boolean> {
  return (await getLimit(plan, key)) > 0;
}

function periodStart(period: "day" | "month"): string {
  const now = new Date();
  if (period === "day") {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

export async function getUsage(
  userId: string,
  metric: UsageMetric,
  period: "day" | "month",
): Promise<number> {
  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from("usage_counters")
    .select("value")
    .eq("user_id", userId)
    .eq("metric", metric)
    .eq("period", period)
    .eq("period_start", periodStart(period))
    .maybeSingle();
  return Number(data?.value ?? 0);
}

export async function incrementUsage(
  userId: string,
  metric: UsageMetric,
  period: "day" | "month",
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  const supabase = createAdminSupabase();
  await supabase.rpc("increment_usage", {
    p_user_id: userId,
    p_metric: metric,
    p_period: period,
    p_period_start: periodStart(period),
    p_amount: amount,
  });
}

const MESSAGES: Record<string, string> = {
  daily_ai_requests: "Günlük yapay zekâ kullanım hakkın doldu.",
  daily_tokens: "Günlük yapay zekâ kotan doldu.",
  monthly_tokens: "Aylık yapay zekâ kotan doldu.",
  monthly_uploads: "Bu ay yükleyebileceğin dosya sayısına ulaştın.",
  max_documents: "Saklayabileceğin materyal sayısına ulaştın.",
  monthly_flashcards: "Bu ayki flashcard üretim hakkın doldu.",
  monthly_quizzes: "Bu ayki quiz üretim hakkın doldu.",
  daily_tutor_messages: "Günlük AI Öğretmen mesaj hakkın doldu.",
  daily_cost_cents: "Günlük yapay zekâ kullanım bütçen doldu. Yarın sıfırlanacak.",
  monthly_cost_cents: "Aylık yapay zekâ kullanım bütçen doldu.",
};

/**
 * Bir işlem öncesi kotayı kontrol eder. Aşıldıysa LimitExceededError fırlatır;
 * API katmanı bunu 402 + yükseltme ekranına çevirir.
 */
export async function assertWithinLimit(
  profile: Profile,
  key: LimitKey,
  metric: UsageMetric,
  period: "day" | "month",
  cost = 1,
): Promise<void> {
  const limit = await getLimit(profile.plan, key);
  if (limit <= 0) {
    throw new LimitExceededError(key, limit, 0, MESSAGES[key] ?? "Kullanım limitine ulaşıldı.");
  }
  const current = await getUsage(profile.id, metric, period);
  if (current + cost > limit) {
    throw new LimitExceededError(
      key,
      limit,
      current,
      MESSAGES[key] ?? "Kullanım limitine ulaşıldı.",
    );
  }
}

/** Materyal sayısı gibi sayaç yerine tablo sayımı gerektiren limit. */
export async function assertDocumentQuota(profile: Profile): Promise<void> {
  const limit = await getLimit(profile.plan, "max_documents");
  const supabase = createAdminSupabase();
  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", profile.id)
    .is("deleted_at", null);
  if ((count ?? 0) >= limit) {
    throw new LimitExceededError(
      "max_documents",
      limit,
      count ?? 0,
      MESSAGES.max_documents,
    );
  }
}

/** Dashboard ve ayarlar sayfasında gösterilen kullanım özeti. */
export async function getUsageSummary(profile: Profile) {
  const limits = (await getPlanLimits())[profile.plan] ?? {};
  const [aiRequests, monthlyCost, uploads, tutorMessages] = await Promise.all([
    getUsage(profile.id, "ai_requests", "day"),
    getUsage(profile.id, "cost_cents", "month"),
    getUsage(profile.id, "uploads", "month"),
    getUsage(profile.id, "tutor_messages", "day"),
  ]);

  const items = [
    {
      key: "monthly_cost_cents",
      label: "Aylık yapay zekâ bütçesi",
      used: monthlyCost,
      limit: limits.monthly_cost_cents ?? 0,
      /** Ham sent değeri kullanıcıya bir şey ifade etmez; yüzde gösterilir. */
      asPercent: true,
    },
    {
      key: "monthly_uploads",
      label: "Aylık yükleme",
      used: uploads,
      limit: limits.monthly_uploads ?? 0,
      asPercent: false,
    },
    {
      key: "daily_ai_requests",
      label: "Günlük AI isteği",
      used: aiRequests,
      limit: limits.daily_ai_requests ?? 0,
      asPercent: false,
    },
    {
      key: "daily_tutor_messages",
      label: "Günlük AI Öğretmen mesajı",
      used: tutorMessages,
      limit: limits.daily_tutor_messages ?? 0,
      asPercent: false,
    },
  ];

  return items.map((item) => {
    const ratio = item.limit > 0 ? item.used / item.limit : 0;
    return {
      ...item,
      percent: Math.min(ratio * 100, 100),
      display: item.asPercent
        ? `%${Math.min(Math.round(ratio * 100), 100)} kullanıldı`
        : `${item.used.toLocaleString("tr-TR")} / ${item.limit.toLocaleString("tr-TR")}`,
    };
  });
}
