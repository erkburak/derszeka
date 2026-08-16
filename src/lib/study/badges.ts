import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";

export type BadgeTier = "bronze" | "silver" | "gold" | "platinum";

export type BadgeMetric =
  | "documents_completed"
  | "streak"
  | "quizzes_completed"
  | "perfect_quizzes"
  | "flashcards_reviewed"
  | "study_minutes"
  | "tutor_messages";

export interface Badge {
  key: string;
  name: string;
  description: string;
  icon: string;
  tier: BadgeTier;
  metric: BadgeMetric;
  threshold: number;
  xp_reward: number;
  order_index: number;
}

export interface EarnedBadge extends Badge {
  earned_at: string;
}

/** Rozet ilerlemesi — kullanıcının her metrikteki güncel değeri. */
export type BadgeMetrics = Record<BadgeMetric, number>;

export async function computeBadgeMetrics(userId: string): Promise<BadgeMetrics> {
  const supabase = createAdminSupabase();

  const [
    profile,
    documents,
    quizzes,
    perfectQuizzes,
    reviews,
    sessions,
    tutorMessages,
  ] = await Promise.all([
    supabase.from("profiles").select("streak_count").eq("id", userId).maybeSingle(),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "completed")
      .is("deleted_at", null),
    supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("completed_at", "is", null),
    supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("score", 100),
    supabase
      .from("flashcard_review_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("study_sessions")
      .select("duration_seconds")
      .eq("user_id", userId)
      .limit(5000),
    supabase
      .from("tutor_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("role", "user"),
  ]);

  const totalSeconds = (sessions.data ?? []).reduce(
    (sum, row) => sum + Number(row.duration_seconds ?? 0),
    0,
  );

  return {
    streak: Number(profile.data?.streak_count ?? 0),
    documents_completed: documents.count ?? 0,
    quizzes_completed: quizzes.count ?? 0,
    perfect_quizzes: perfectQuizzes.count ?? 0,
    flashcards_reviewed: reviews.count ?? 0,
    study_minutes: Math.floor(totalSeconds / 60),
    tutor_messages: tutorMessages.count ?? 0,
  };
}

/**
 * Kullanıcının hak ettiği yeni rozetleri verir.
 * Çalışma/quiz/flashcard olaylarından sonra çağrılır; idempotenttir
 * (unique kısıt sayesinde aynı rozet iki kez verilmez).
 */
export async function evaluateBadges(userId: string): Promise<Badge[]> {
  const supabase = createAdminSupabase();

  const [{ data: allBadges }, { data: earned }] = await Promise.all([
    supabase.from("badges").select("*").eq("is_active", true),
    supabase.from("user_badges").select("badge_key").eq("user_id", userId),
  ]);

  const badges = (allBadges ?? []) as Badge[];
  const earnedKeys = new Set((earned ?? []).map((row) => row.badge_key as string));
  const candidates = badges.filter((badge) => !earnedKeys.has(badge.key));
  if (candidates.length === 0) return [];

  const metrics = await computeBadgeMetrics(userId);
  const newlyEarned = candidates.filter(
    (badge) => (metrics[badge.metric] ?? 0) >= Number(badge.threshold),
  );
  if (newlyEarned.length === 0) return [];

  const { data: inserted } = await supabase
    .from("user_badges")
    .upsert(
      newlyEarned.map((badge) => ({ user_id: userId, badge_key: badge.key })),
      { onConflict: "user_id,badge_key", ignoreDuplicates: true },
    )
    .select("badge_key");

  const confirmedKeys = new Set(
    (inserted ?? []).map((row) => row.badge_key as string),
  );
  const confirmed = newlyEarned.filter((badge) => confirmedKeys.has(badge.key));
  if (confirmed.length === 0) return [];

  // Rozet XP'si profile eklenir.
  const bonusXp = confirmed.reduce((sum, badge) => sum + Number(badge.xp_reward), 0);
  if (bonusXp > 0) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("xp")
      .eq("id", userId)
      .single();
    await supabase
      .from("profiles")
      .update({ xp: Number(profile?.xp ?? 0) + bonusXp })
      .eq("id", userId);
  }

  await supabase.from("notifications").insert(
    confirmed.map((badge) => ({
      user_id: userId,
      type: "success",
      title: `Yeni rozet: ${badge.name}`,
      body: `${badge.description}${badge.xp_reward > 0 ? ` (+${badge.xp_reward} XP)` : ""}`,
      link: "/achievements",
    })),
  );

  return confirmed;
}

export async function loadBadgeBoard(userId: string): Promise<{
  earned: EarnedBadge[];
  locked: (Badge & { progress: number; current: number })[];
  metrics: BadgeMetrics;
  totalXpFromBadges: number;
}> {
  const supabase = createAdminSupabase();

  const [{ data: allBadges }, { data: earnedRows }, metrics] = await Promise.all([
    supabase
      .from("badges")
      .select("*")
      .eq("is_active", true)
      .order("order_index", { ascending: true }),
    supabase
      .from("user_badges")
      .select("badge_key, earned_at")
      .eq("user_id", userId),
    computeBadgeMetrics(userId),
  ]);

  const badges = (allBadges ?? []) as Badge[];
  const earnedAtByKey = new Map(
    (earnedRows ?? []).map((row) => [
      row.badge_key as string,
      row.earned_at as string,
    ]),
  );

  const earned: EarnedBadge[] = [];
  const locked: (Badge & { progress: number; current: number })[] = [];

  for (const badge of badges) {
    const earnedAt = earnedAtByKey.get(badge.key);
    if (earnedAt) {
      earned.push({ ...badge, earned_at: earnedAt });
      continue;
    }
    const current = metrics[badge.metric] ?? 0;
    locked.push({
      ...badge,
      current,
      progress: Math.min((current / Number(badge.threshold)) * 100, 99),
    });
  }

  earned.sort((a, b) => b.earned_at.localeCompare(a.earned_at));
  locked.sort((a, b) => b.progress - a.progress);

  return {
    earned,
    locked,
    metrics,
    totalXpFromBadges: earned.reduce((sum, badge) => sum + Number(badge.xp_reward), 0),
  };
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  value: number;
  streak: number;
  badgeCount?: number;
}

export async function loadLeaderboards(limit = 20): Promise<{
  xp: LeaderboardEntry[];
  weekly: LeaderboardEntry[];
}> {
  const supabase = createAdminSupabase();

  const [xpResult, weeklyResult] = await Promise.all([
    supabase.rpc("leaderboard_xp", { p_limit: limit }),
    supabase.rpc("leaderboard_weekly", { p_limit: limit }),
  ]);

  return {
    xp: (xpResult.data ?? []).map(
      (row: {
        rank: number;
        user_id: string;
        display_name: string;
        xp: number;
        streak: number;
        badge_count: number;
      }) => ({
        rank: row.rank,
        userId: row.user_id,
        displayName: row.display_name,
        value: row.xp,
        streak: row.streak,
        badgeCount: Number(row.badge_count),
      }),
    ),
    weekly: (weeklyResult.data ?? []).map(
      (row: {
        rank: number;
        user_id: string;
        display_name: string;
        minutes: number;
        streak: number;
      }) => ({
        rank: row.rank,
        userId: row.user_id,
        displayName: row.display_name,
        value: row.minutes,
        streak: row.streak,
      }),
    ),
  };
}

export async function loadOwnRank(userId: string): Promise<number | null> {
  const supabase = createAdminSupabase();
  const { data } = await supabase.rpc("leaderboard_rank_of", { p_user_id: userId });
  return data === null || data === undefined ? null : Number(data);
}
