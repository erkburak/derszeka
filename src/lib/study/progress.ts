import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import { computeMastery } from "@/lib/study/spaced-repetition";
import { evaluateBadges } from "@/lib/study/badges";
import { queueBadgeEmail } from "@/lib/email/triggers";

/** Bir konudaki doğru/yanlış sonucunu işleyip hakimiyet oranını günceller. */
export async function recordTopicOutcome(params: {
  userId: string;
  documentId: string;
  topicId: string | null;
  correct: boolean;
}) {
  const supabase = createAdminSupabase();

  const query = supabase
    .from("study_progress")
    .select("id, correct_count, wrong_count")
    .eq("user_id", params.userId)
    .eq("document_id", params.documentId);

  const { data: existing } = params.topicId
    ? await query.eq("topic_id", params.topicId).maybeSingle()
    : await query.is("topic_id", null).maybeSingle();

  const correct = Number(existing?.correct_count ?? 0) + (params.correct ? 1 : 0);
  const wrong = Number(existing?.wrong_count ?? 0) + (params.correct ? 0 : 1);
  const mastery = computeMastery(correct, wrong);

  // Zayıf konular daha erken tekrar edilir.
  const daysUntilReview = mastery > 0.85 ? 7 : mastery > 0.6 ? 3 : 1;
  const nextReview = new Date(Date.now() + daysUntilReview * 86_400_000);

  const payload = {
    user_id: params.userId,
    document_id: params.documentId,
    topic_id: params.topicId,
    correct_count: correct,
    wrong_count: wrong,
    mastery,
    last_studied_at: new Date().toISOString(),
    next_review_at: nextReview.toISOString(),
  };

  if (existing) {
    await supabase.from("study_progress").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("study_progress").insert(payload);
  }
}

/** Çalışma seansı kaydı + streak/XP güncellemesi. */
export async function recordStudySession(params: {
  userId: string;
  documentId?: string | null;
  topicId?: string | null;
  mode: "reading" | "flashcard" | "quiz" | "tutor" | "guided";
  durationSeconds: number;
  xp?: number;
  meta?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabase();

  await supabase.from("study_sessions").insert({
    user_id: params.userId,
    document_id: params.documentId ?? null,
    topic_id: params.topicId ?? null,
    mode: params.mode,
    ended_at: new Date().toISOString(),
    duration_seconds: Math.max(0, Math.round(params.durationSeconds)),
    meta: params.meta ?? {},
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("xp, streak_count, longest_streak, last_study_date")
    .eq("id", params.userId)
    .single();

  if (!profile) return;

  const today = new Date().toISOString().slice(0, 10);
  const last = profile.last_study_date as string | null;

  let streak = Number(profile.streak_count ?? 0);
  if (last !== today) {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    streak = last === yesterday ? streak + 1 : 1;
  }

  await supabase
    .from("profiles")
    .update({
      xp: Number(profile.xp ?? 0) + (params.xp ?? 0),
      streak_count: streak,
      longest_streak: Math.max(Number(profile.longest_streak ?? 0), streak),
      last_study_date: today,
    })
    .eq("id", params.userId);

  await awardBadges(params.userId);
}

/** Rozet değerlendirmesi; hata durumunda ana akışı kesmez. */
export async function awardBadges(userId: string) {
  try {
    const earned = await evaluateBadges(userId);
    for (const badge of earned) {
      await queueBadgeEmail(userId, badge.name, badge.description);
    }
  } catch (error) {
    console.error("[badges]", error);
  }
}
