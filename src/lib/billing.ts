import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

/**
 * Gerçek takvim ayı ekler: 31 Ocak + 1 ay = 28/29 Şubat.
 * Sabit 30 gün yerine bunu kullanıyoruz ki abonelik tarihi kaymasın.
 */
export function addCalendarMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  // Ay taştıysa (31 Ocak → 3 Mart gibi) hedef ayın son gününe çek.
  if (result.getDate() < day) result.setDate(0);
  return result;
}

/**
 * Ödeme onaylandığında aboneliği uzatır.
 * Aktif abonelik varsa bitiş tarihinden, yoksa bugünden başlar.
 */
export async function activatePremium(params: {
  userId: string;
  months?: number;
  paymentRequestId?: string | null;
  createdBy?: string | null;
  source?: string;
}): Promise<{ startsAt: Date; endsAt: Date }> {
  const supabase = createAdminSupabase();
  const months = params.months ?? 1;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, ends_at")
    .eq("user_id", params.userId)
    .eq("status", "active")
    .order("ends_at", { ascending: false })
    .maybeSingle();

  const now = new Date();
  const existingEnd = existing?.ends_at ? new Date(existing.ends_at as string) : null;
  const startsAt = existingEnd && existingEnd > now ? existingEnd : now;
  const endsAt = addCalendarMonths(startsAt, months);

  await supabase.from("subscriptions").insert({
    user_id: params.userId,
    plan: "premium",
    status: "active",
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    source: params.source ?? "bank_transfer",
    payment_request_id: params.paymentRequestId ?? null,
    created_by: params.createdBy ?? null,
  });

  if (existing) {
    await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("id", existing.id);
  }

  await supabase
    .from("profiles")
    .update({ plan: "premium", plan_expires_at: endsAt.toISOString() })
    .eq("id", params.userId);

  return { startsAt, endsAt };
}

export async function revokePremium(userId: string): Promise<void> {
  const supabase = createAdminSupabase();
  await supabase
    .from("subscriptions")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "active");
  await supabase
    .from("profiles")
    .update({ plan: "free", plan_expires_at: null })
    .eq("id", userId);
}
