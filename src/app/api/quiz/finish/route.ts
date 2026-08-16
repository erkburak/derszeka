import { NextResponse } from "next/server";
import { AppError, readJson, withApi } from "@/lib/api";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase/server";
import { recordStudySession } from "@/lib/study/progress";

export const runtime = "nodejs";

interface Body {
  attemptId: string;
  durationSeconds?: number;
}

export const POST = withApi(async (request: Request) => {
  const profile = await requireProfile();
  const body = await readJson<Body>(request);

  const supabase = await createServerSupabase();
  const { data: attempt } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, total_questions, started_at, completed_at")
    .eq("id", body.attemptId)
    .maybeSingle();

  if (!attempt) throw new AppError("Deneme bulunamadı.", 404, "not_found");

  const admin = createAdminSupabase();
  const { data: answers } = await admin
    .from("quiz_answers")
    .select("is_correct, score")
    .eq("attempt_id", attempt.id);

  const rows = answers ?? [];
  const correctCount = rows.filter((row) => row.is_correct).length;
  const totalQuestions = Number(attempt.total_questions) || rows.length || 1;
  const totalScore = rows.reduce((sum, row) => sum + Number(row.score ?? 0), 0);
  const score = Number(((totalScore / totalQuestions) * 100).toFixed(2));

  const duration =
    body.durationSeconds ??
    Math.round((Date.now() - new Date(attempt.started_at as string).getTime()) / 1000);

  if (!attempt.completed_at) {
    await admin
      .from("quiz_attempts")
      .update({
        completed_at: new Date().toISOString(),
        correct_count: correctCount,
        score,
        duration_seconds: duration,
      })
      .eq("id", attempt.id);

    const { data: quiz } = await admin
      .from("quizzes")
      .select("document_id")
      .eq("id", attempt.quiz_id)
      .single();

    await recordStudySession({
      userId: profile.id,
      documentId: (quiz?.document_id as string) ?? null,
      mode: "quiz",
      durationSeconds: duration,
      xp: correctCount * 10,
      meta: { attemptId: attempt.id, score },
    });
  }

  return NextResponse.json({
    score,
    correctCount,
    totalQuestions,
    durationSeconds: duration,
  });
});
