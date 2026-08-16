import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { createAdminSupabase } from "@/lib/supabase/server";
import {
  queuePremiumExpiringEmail,
  queueStudyReminderEmail,
} from "@/lib/email/triggers";
import { triggerWorker } from "@/lib/jobs/queue";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const REMINDER_COOLDOWN_DAYS = 3;
const MAX_REMINDERS_PER_RUN = 200;

/**
 * Günlük bakım işi:
 *  1. Süresi dolan Premium üyelikleri düşürür.
 *  2. Bitmek üzere olan üyeliklere hatırlatma yollar.
 *  3. Bir süredir çalışmayan kullanıcılara çalışma hatırlatması yollar.
 *  4. Eski rate-limit kayıtlarını temizler.
 */
async function handle(request: Request) {
  const auth = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron");
  if (auth !== `Bearer ${serverEnv.workerSecret}` && !cronHeader) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const settings = await getSettings(true);
  const now = new Date();

  const result = {
    expired: 0,
    expiringNotified: 0,
    remindersSent: 0,
    cleaned: 0,
  };

  // 1) Süresi dolmuş abonelikler
  const { data: expired } = await supabase
    .from("profiles")
    .select("id")
    .eq("plan", "premium")
    .not("plan_expires_at", "is", null)
    .lt("plan_expires_at", now.toISOString());

  for (const profile of expired ?? []) {
    await supabase
      .from("profiles")
      .update({ plan: "free", plan_expires_at: null })
      .eq("id", profile.id);
    await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("user_id", profile.id)
      .eq("status", "active");
    await supabase.from("notifications").insert({
      user_id: profile.id,
      type: "info",
      title: "Premium üyeliğin sona erdi",
      body: "Kaldığın yerden devam etmek için üyeliğini yenileyebilirsin.",
      link: "/premium",
    });
    result.expired += 1;
  }

  // 2) Yakında bitecek abonelikler
  if (settings.email_enabled) {
    const warnDays = Number(settings.email_premium_expiry_days);
    const windowStart = new Date(now.getTime() + (warnDays - 1) * 86_400_000);
    const windowEnd = new Date(now.getTime() + warnDays * 86_400_000);

    const { data: expiring } = await supabase
      .from("profiles")
      .select("id, plan_expires_at")
      .eq("plan", "premium")
      .gte("plan_expires_at", windowStart.toISOString())
      .lt("plan_expires_at", windowEnd.toISOString());

    for (const profile of expiring ?? []) {
      await queuePremiumExpiringEmail(
        profile.id as string,
        new Date(profile.plan_expires_at as string),
        warnDays,
      );
      result.expiringNotified += 1;
    }
  }

  // 3) Çalışma hatırlatmaları
  if (settings.email_enabled && settings.email_reminder_enabled) {
    const idleDays = Number(settings.email_reminder_idle_days);
    const idleBefore = new Date(now.getTime() - idleDays * 86_400_000);
    const cooldownBefore = new Date(
      now.getTime() - REMINDER_COOLDOWN_DAYS * 86_400_000,
    );

    const { data: idleUsers } = await supabase
      .from("profiles")
      .select("id, last_study_date, last_reminder_sent_at")
      .eq("is_active", true)
      .eq("study_reminders", true)
      .eq("email_notifications", true)
      .eq("onboarding_completed", true)
      .is("anonymized_at", null)
      .not("last_study_date", "is", null)
      .lte("last_study_date", idleBefore.toISOString().slice(0, 10))
      .limit(MAX_REMINDERS_PER_RUN);

    for (const profile of idleUsers ?? []) {
      const lastReminder = profile.last_reminder_sent_at as string | null;
      if (lastReminder && new Date(lastReminder) > cooldownBefore) continue;

      const { count: dueCards } = await supabase
        .from("flashcard_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .lte("due_at", now.toISOString());

      await queueStudyReminderEmail(profile.id as string, dueCards ?? 0);
      await supabase
        .from("profiles")
        .update({ last_reminder_sent_at: now.toISOString() })
        .eq("id", profile.id);
      result.remindersSent += 1;
    }
  }

  // 4) Temizlik — 2 günden eski rate limit pencereleri
  const { count: cleaned } = await supabase
    .from("rate_limits")
    .delete({ count: "exact" })
    .lt("window_start", new Date(now.getTime() - 2 * 86_400_000).toISOString());
  result.cleaned = cleaned ?? 0;

  triggerWorker();
  return NextResponse.json(result);
}

export const POST = handle;
export const GET = handle;
