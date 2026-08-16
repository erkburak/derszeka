import "server-only";

import { createAdminSupabase } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export interface TopicMastery {
  topicId: string | null;
  title: string;
  mastery: number;
  documentId: string;
}

export interface DashboardData {
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  dailyGoalMinutes: number;
  documentCount: number;
  readyDocumentCount: number;
  processingDocumentCount: number;
  quizAttempts: number;
  averageQuizScore: number;
  flashcardAccuracy: number;
  dueFlashcards: number;
  weakTopics: TopicMastery[];
  strongTopics: TopicMastery[];
  weeklyMinutes: { date: string; minutes: number }[];
  upcomingExams: {
    id: string;
    title: string;
    examName: string | null;
    examDate: string;
    daysLeft: number;
  }[];
  suggestions: string[];
}

function startOfDay(offsetDays = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

export async function loadDashboard(profile: Profile): Promise<DashboardData> {
  const supabase = createAdminSupabase();
  const weekStart = startOfDay(6).toISOString();
  const todayStart = startOfDay(0).toISOString();

  const [
    sessions,
    documents,
    attempts,
    reviewLogs,
    progressRows,
    dueCards,
    plans,
  ] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("started_at, duration_seconds")
      .eq("user_id", profile.id)
      .order("started_at", { ascending: false })
      .limit(1000),
    supabase
      .from("documents")
      .select("id, status")
      .eq("owner_id", profile.id)
      .is("deleted_at", null),
    supabase
      .from("quiz_attempts")
      .select("score, completed_at")
      .eq("user_id", profile.id)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(200),
    supabase
      .from("flashcard_review_logs")
      .select("result")
      .eq("user_id", profile.id)
      .gte("reviewed_at", startOfDay(29).toISOString())
      .limit(2000),
    supabase
      .from("study_progress")
      .select("topic_id, document_id, mastery, correct_count, wrong_count")
      .eq("user_id", profile.id)
      .order("mastery", { ascending: true })
      .limit(50),
    supabase
      .from("flashcard_progress")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .lte("due_at", new Date().toISOString()),
    supabase
      .from("study_plans")
      .select("id, title, exam_name, exam_date")
      .eq("user_id", profile.id)
      .eq("status", "active")
      .not("exam_date", "is", null)
      .gte("exam_date", new Date().toISOString().slice(0, 10))
      .order("exam_date", { ascending: true })
      .limit(3),
  ]);

  const sessionRows = sessions.data ?? [];
  const totalSeconds = sessionRows.reduce(
    (sum, row) => sum + Number(row.duration_seconds ?? 0),
    0,
  );
  const todaySeconds = sessionRows
    .filter((row) => (row.started_at as string) >= todayStart)
    .reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);
  const weekSeconds = sessionRows
    .filter((row) => (row.started_at as string) >= weekStart)
    .reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0);

  const weeklyMinutes = Array.from({ length: 7 }, (_, index) => {
    const day = startOfDay(6 - index);
    const next = new Date(day.getTime() + 86_400_000);
    const minutes =
      sessionRows
        .filter((row) => {
          const at = new Date(row.started_at as string).getTime();
          return at >= day.getTime() && at < next.getTime();
        })
        .reduce((sum, row) => sum + Number(row.duration_seconds ?? 0), 0) / 60;
    return { date: day.toISOString().slice(0, 10), minutes: Math.round(minutes) };
  });

  const docRows = documents.data ?? [];
  const attemptRows = attempts.data ?? [];
  const averageQuizScore =
    attemptRows.length > 0
      ? attemptRows.reduce((sum, row) => sum + Number(row.score ?? 0), 0) /
        attemptRows.length
      : 0;

  const logRows = reviewLogs.data ?? [];
  const knownCount = logRows.filter((row) => row.result === "known").length;
  const flashcardAccuracy =
    logRows.length > 0 ? (knownCount / logRows.length) * 100 : 0;

  const progress = progressRows.data ?? [];
  const topicIds = progress
    .map((row) => row.topic_id as string | null)
    .filter((id): id is string => Boolean(id));

  const { data: topicNames } = topicIds.length
    ? await supabase.from("topics").select("id, title").in("id", topicIds)
    : { data: [] };

  const nameById = new Map(
    (topicNames ?? []).map((row) => [row.id as string, row.title as string]),
  );

  const mapped: TopicMastery[] = progress
    .filter((row) => Number(row.correct_count) + Number(row.wrong_count) >= 3)
    .map((row) => ({
      topicId: (row.topic_id as string | null) ?? null,
      title: nameById.get(row.topic_id as string) ?? "Genel",
      mastery: Number(row.mastery),
      documentId: row.document_id as string,
    }));

  const suggestions: string[] = [];
  const weak = mapped.filter((topic) => topic.mastery < 0.6).slice(0, 3);
  const strong = [...mapped]
    .filter((topic) => topic.mastery >= 0.8)
    .sort((a, b) => b.mastery - a.mastery)
    .slice(0, 3);

  const goalMinutes = profile.daily_goal_minutes;
  const todayMinutes = Math.round(todaySeconds / 60);

  if (todayMinutes < goalMinutes) {
    suggestions.push(
      `Bugünkü hedefine ulaşmak için ${goalMinutes - todayMinutes} dakika daha çalışman gerekiyor.`,
    );
  } else {
    suggestions.push(
      `Bugünkü ${goalMinutes} dakikalık hedefini tamamladın. Harika gidiyorsun!`,
    );
  }

  if (weak.length > 0) {
    suggestions.push(
      `${weak[0]!.title} konusunda tekrar yapman öneriliyor — başarı oranın %${Math.round(weak[0]!.mastery * 100)}.`,
    );
  }

  const due = dueCards.count ?? 0;
  if (due > 0) {
    suggestions.push(`${due} flashcard tekrar zamanı geldi. 10 dakikada bitirebilirsin.`);
  }

  const nextExam = (plans.data ?? [])[0];
  if (nextExam?.exam_date) {
    const daysLeft = Math.ceil(
      (new Date(nextExam.exam_date as string).getTime() - Date.now()) / 86_400_000,
    );
    suggestions.push(
      `${nextExam.exam_name ?? nextExam.title} sınavına ${daysLeft} gün kaldı.`,
    );
  }

  if (docRows.length === 0) {
    suggestions.push("Henüz materyalin yok. İlk ders notunu yükleyerek başla.");
  }

  return {
    todaySeconds,
    weekSeconds,
    totalSeconds,
    dailyGoalMinutes: goalMinutes,
    documentCount: docRows.length,
    readyDocumentCount: docRows.filter((row) => row.status === "completed").length,
    processingDocumentCount: docRows.filter(
      (row) => !["completed", "failed"].includes(row.status as string),
    ).length,
    quizAttempts: attemptRows.length,
    averageQuizScore,
    flashcardAccuracy,
    dueFlashcards: due,
    weakTopics: weak,
    strongTopics: strong,
    weeklyMinutes,
    upcomingExams: (plans.data ?? []).map((row) => ({
      id: row.id as string,
      title: row.title as string,
      examName: (row.exam_name as string | null) ?? null,
      examDate: row.exam_date as string,
      daysLeft: Math.ceil(
        (new Date(row.exam_date as string).getTime() - Date.now()) / 86_400_000,
      ),
    })),
    suggestions: suggestions.slice(0, 4),
  };
}
